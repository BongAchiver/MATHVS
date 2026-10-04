"""Exercise the real update script in isolated directories with fake network/Docker."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


class UpdateTests(unittest.TestCase):
    def run_case(self, failure="", current="build-5-aaaaaaa"):
        with tempfile.TemporaryDirectory(prefix="mathvs-update-test-") as directory:
            root = Path(directory)
            app, fixtures, binary = root / "app", root / "fixtures", root / "bin"
            for path in [app, fixtures, binary, app / "releases/build-5-aaaaaaa", app / "backups"]:
                path.mkdir(parents=True, exist_ok=True)
            (app / "current-release").write_text(current)
            (app / "compose.yaml").write_text("image: mathvs:build-5-aaaaaaa\n")
            (app / "releases/build-5-aaaaaaa/old.tar.gz").write_text("old archive")
            (app / "database").write_text("account and rating must survive")
            (app / ".env").write_text("persistent environment")
            assets = {"compose.yaml": "image: mathvs:build-6-bbbbbbb\n",
                      "mathvs-image.tar.gz": "new image", "env.example": "example", "RELEASE.md": "notes"}
            for name, content in assets.items():
                (fixtures / name).write_text(content)
            (fixtures / "SHA256SUMS").write_text("".join(
                hashlib.sha256((fixtures / name).read_bytes()).hexdigest() + "  " + name + "\n" for name in assets))
            script = Path(__file__).with_name("update.sh").read_text()
            script = script.replace("/opt/mathvs", str(app)).replace("/run/mathvs-update.lock", str(root / "lock"))
            (app / "update.sh").write_text(script)
            (app / "backup.sh").write_text(f"#!/bin/sh\ncp '{app}/database' '{app}/backups/verified.db'\n")
            (app / "backup.sh").chmod(0o700)
            (binary / "curl").write_text("""#!/usr/bin/python3
import os,sys,shutil
from pathlib import Path
a=sys.argv[1:]
if '-o' in a:
    destination=a[a.index('-o')+1]
    shutil.copy(Path(os.environ['FIXTURES'])/Path(destination).name,destination)
elif os.environ.get('FAILURE')=='api':
    sys.exit(22)
else:
    print('{"status":"ok"}')
""")
            (binary / "docker").write_text("""#!/bin/sh
printf '%s\n' "$*" >> "$CALLS"
if [ "$1 $2" = 'image ls' ]; then
    printf 'mathvs:build-5-aaaaaaa\nmathvs:build-6-bbbbbbb\n'
fi
if [ "$1 $2" = 'compose up' ] && [ "$FAILURE" = 'container' ] && grep -q bbbbbbb compose.yaml; then exit 1; fi
exit 0
""")
            for path in binary.iterdir():
                path.chmod(0o700)
            environment = dict(os.environ, PATH=str(binary) + ":" + os.environ["PATH"],
                               FIXTURES=str(fixtures), CALLS=str(root / "calls"), FAILURE=failure)
            run = subprocess.run(["bash", str(app / "update.sh"), "build-6-bbbbbbb"],
                                 env=environment, capture_output=True, text=True)
            self.assertEqual((app / "database").read_text(), "account and rating must survive")
            self.assertEqual((app / ".env").read_text(), "persistent environment")
            calls = (root / "calls").read_text() if (root / "calls").exists() else ""
            if current == "build-6-bbbbbbb":
                self.assertEqual(run.returncode, 0, run.stderr)
                self.assertEqual(calls, "")
                self.assertFalse((app / "backups/verified.db").exists())
            elif failure:
                self.assertNotEqual(run.returncode, 0)
                self.assertIn("aaaaaaa", (app / "compose.yaml").read_text())
                self.assertEqual((app / "current-release").read_text(), "build-5-aaaaaaa")
                self.assertTrue((app / "releases/build-5-aaaaaaa/old.tar.gz").exists())
                self.assertNotIn("image rm mathvs:build-5-aaaaaaa", calls)
            else:
                self.assertEqual(run.returncode, 0, run.stderr)
                self.assertEqual((app / "current-release").read_text().strip(), "build-6-bbbbbbb")
                self.assertFalse((app / "releases/build-5-aaaaaaa").exists())
                self.assertFalse((app / "releases/build-6-bbbbbbb/mathvs-image.tar.gz").exists())
                self.assertIn("image rm mathvs:build-5-aaaaaaa", calls)
                self.assertNotIn("image rm mathvs:build-6-bbbbbbb", calls)
                self.assertEqual((app / "backups/verified.db").read_text(), (app / "database").read_text())
            self.assertNotIn("volume rm", calls)
            self.assertNotIn("system prune", calls)
            self.assertFalse((app / "releases/.incoming-build-6-bbbbbbb").exists())

    def test_success_keeps_data_and_cleans_only_old_releases(self): self.run_case()
    def test_failed_container_restores_old_image_without_cleanup(self): self.run_case("container")
    def test_failed_api_restores_old_image_without_cleanup(self): self.run_case("api")
    def test_current_release_does_not_download_or_restart(self): self.run_case(current="build-6-bbbbbbb")


if __name__ == "__main__":
    unittest.main()
