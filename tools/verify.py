"""Verify Scripting import metadata, runtime files and ZIP structure."""
import json, re, zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
with zipfile.ZipFile(root/'dist/MANGE.zip') as z:
 assert z.testzip() is None
 assert set(z.namelist())=={'script.json','index.tsx','ui.ts'}
 metadata=json.loads(z.read('script.json'))
 assert metadata['name']=='MANGE'
 assert metadata['entry'] in z.namelist()
 assert metadata['version']=='1.0.4'
 for name in z.namelist():
  assert z.read(name)==(root/name).read_bytes(), name
 for module in re.findall(r"from ['\"]\./([^'\"]+)['\"]",z.read('index.tsx').decode()):
  assert module+'.ts' in z.namelist(),module
 assert b'remoteResource' not in z.read('script.json')
print('PASS metadata, root layout, entry, dependencies, version and package/source consistency')
