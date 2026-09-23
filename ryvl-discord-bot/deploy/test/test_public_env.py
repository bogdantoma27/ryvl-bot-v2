"""No real secrets/database are used: each test has its own disposable directory."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'set_public_origin.py'
class PublicOriginTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.exists(), 'the safe public-origin updater must exist')
        spec = importlib.util.spec_from_file_location('set_public_origin', SCRIPT)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = self.root / '.env'
        self.backups = self.root / 'private-backups'
    def test_updates_only_public_urls_and_preserves_secret_bytes(self):
        original = b'# production\r\nDATABASE_URL="postgresql://example:p=a#b@host/db"\r\nDISCORD_TOKEN=not-a-real-token\r\nJWT_SECRET=not-a-real-secret\r\nFRONTEND_URL=http://130.61.228.100\r\nDISCORD_OAUTH_REDIRECT_URI=http://130.61.228.100/api/auth/discord/callback\r\nPORT=3000\r\n'
        self.env.write_bytes(original)
        self.assertTrue(self.module.update_file(self.env, 'https://ryvl.top', self.backups))
        updated = self.env.read_bytes()
        self.assertIn(b'FRONTEND_URL=https://ryvl.top\r\n', updated)
        self.assertIn(b'DISCORD_OAUTH_REDIRECT_URI=https://ryvl.top/api/auth/discord/callback\r\n', updated)
        for line in original.splitlines(keepends=True):
            if not line.startswith((b'FRONTEND_URL=', b'DISCORD_OAUTH_REDIRECT_URI=')):
                self.assertIn(line, updated)
        backups = list(self.backups.glob('env-*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), original)
        self.assertEqual(self.env.stat().st_mode & 0o777, 0o600)
        self.assertEqual(backups[0].stat().st_mode & 0o777, 0o600)
    def test_repeat_is_idempotent_and_creates_no_extra_backup(self):
        self.env.write_text('PORT=3000\nFRONTEND_URL=https://ryvl.top\nDISCORD_OAUTH_REDIRECT_URI=https://ryvl.top/api/auth/discord/callback\n')
        self.assertFalse(self.module.update_file(self.env, 'https://ryvl.top', self.backups))
        self.assertFalse(self.backups.exists())
    def test_removes_duplicate_target_keys_and_updates_existing_legacy_url(self):
        self.env.write_text('export FRONTEND_URL="http://localhost:4201"\nFRONTEND_URL=http://old.example\nWEB_BASE_URL=http://old.example\nPORT=3000')
        self.module.update_file(self.env, 'https://ryvl.top', self.backups)
        text=self.env.read_text()
        self.assertEqual(text.count('FRONTEND_URL='), 1)
        self.assertIn('WEB_BASE_URL=https://ryvl.top\n', text)
        self.assertIn('DISCORD_OAUTH_REDIRECT_URI=https://ryvl.top/api/auth/discord/callback\n', text)
        self.assertIn('PORT=3000\n', text)
    def test_rejects_bad_origin_without_touching_file(self):
        self.env.write_text('PORT=3000\n')
        for origin in ('http://ryvl.top', 'https://user:pass@ryvl.top', 'https://ryvl.top/path', 'https://ryvl.top?x=1', 'https://ryvl.top/#x'):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                self.module.update_file(self.env, origin, self.backups)
            self.assertEqual(self.env.read_text(), 'PORT=3000\n')
    def test_missing_or_symlink_environment_is_not_overwritten(self):
        with self.assertRaises(ValueError):
            self.module.update_file(self.env, 'https://ryvl.top', self.backups)
        real=self.root/'real-env'; real.write_text('PORT=3000\n'); self.env.symlink_to(real)
        with self.assertRaises(ValueError):
            self.module.update_file(self.env, 'https://ryvl.top', self.backups)
        self.assertEqual(real.read_text(), 'PORT=3000\n')
if __name__ == '__main__':
    unittest.main()
