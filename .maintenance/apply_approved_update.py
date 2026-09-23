"""Temporary review helper, used only on the isolated implementation branch.

The production branch receives the generated, tested source files, not this helper.
No production VM or production database is accessed by this script.
"""
from pathlib import Path
import runpy
import subprocess

branch = subprocess.check_output(['git', 'branch', '--show-current'], text=True).strip()
if branch != 'update/vpg-automation-public-ux':
    raise SystemExit('This temporary transformation must only run on the isolated update branch')

# A generated source commit is already complete; never transform it twice.
if Path('ryvl-discord-bot/server/src/vpg/notification-policy.ts').exists():
    print('Generated source already exists; validating it without applying transformations again.')
else:
    for script in ['backend_update.py', 'frontend_update.py', 'tests_update.py', 'docs_deploy_update.py', 'review_update.py']:
        print(f'Applying reviewed change set: {script}', flush=True)
        runpy.run_path(str(Path('.maintenance') / script), run_name='__main__')
    print('Source prepared. Commit is permitted only after all CI checks succeed.', flush=True)
