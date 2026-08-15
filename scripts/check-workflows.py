#!/usr/bin/env python3
"""Validate the GitHub Actions workflows before pushing them.

Why this exists: a workflow file that does not parse produces a run with
ZERO jobs. The run shows as "failure" with no job list and no logs, which
reads like an infrastructure problem rather than a syntax error in the file
you just edited. That cost a full cycle here — the giveaway was
`total_count: 0` from the jobs API, which nobody looks at by default.

CI cannot guard this: if the workflow does not parse, the job that would
check it never runs. So it is a local gate, run before pushing.

Checks:
  1. every workflow parses as YAML
  2. every heredoc opened inside a `run:` block is closed
  3. `jobs` exists and each job has steps

Usage: python3 scripts/check-workflows.py
"""

import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("PyYAML not available; skipping (install with: pip3 install pyyaml)")
    sys.exit(0)

WORKFLOWS = Path(__file__).resolve().parent.parent / ".github" / "workflows"
HEREDOC = re.compile(r"<<-?\s*'?\"?([A-Za-z_][A-Za-z0-9_]*)'?\"?")

problems = []
files = sorted(WORKFLOWS.glob("*.yml")) + sorted(WORKFLOWS.glob("*.yaml"))

if not files:
    print(f"no workflows found under {WORKFLOWS}")
    sys.exit(1)

for path in files:
    try:
        doc = yaml.safe_load(path.read_text())
    except yaml.YAMLError as exc:
        problems.append(f"{path.name}: does not parse — {exc}")
        continue

    jobs = doc.get("jobs") if isinstance(doc, dict) else None
    if not jobs:
        problems.append(f"{path.name}: no jobs")
        continue

    for job_name, job in jobs.items():
        steps = job.get("steps") or []
        if not steps:
            problems.append(f"{path.name}: job '{job_name}' has no steps")
        for step in steps:
            script = step.get("run")
            if not script:
                continue
            label = step.get("name", "<unnamed>")
            # A heredoc whose terminator got dedented out of the YAML block
            # scalar is the specific failure this file was written for.
            for marker in HEREDOC.findall(script):
                closers = [l for l in script.split("\n") if l.strip() == marker]
                if not closers:
                    problems.append(
                        f"{path.name}: job '{job_name}', step '{label}': "
                        f"heredoc <<{marker} is never closed — check the "
                        f"terminator is still indented inside the block scalar"
                    )

if problems:
    print("workflow check FAILED")
    for p in problems:
        print(f"  - {p}")
    sys.exit(1)

print(f"workflow check OK — {len(files)} file(s), "
      f"{sum(len(yaml.safe_load(f.read_text())['jobs']) for f in files)} job(s)")
