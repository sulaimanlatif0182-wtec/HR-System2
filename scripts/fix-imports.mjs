import fs from 'fs';
import path from 'path';

// Fix 1: lib/api/employees/router.js — './employees/X.js' -> './X.js'
const routerPath = path.join(process.cwd(), 'lib/api/employees/router.js');
let routerSrc = fs.readFileSync(routerPath, 'utf8');
routerSrc = routerSrc.replace(/from '\.\/employees\//g, "from './");
fs.writeFileSync(routerPath, routerSrc);
console.log('Fixed router.js');

// Fix 2: lib/api/employees/index.js dynamic imports
const empIndexPath = path.join(process.cwd(), 'lib/api/employees/index.js');
let empIdx = fs.readFileSync(empIndexPath, 'utf8');
empIdx = empIdx.replace(/import\('\.\.\/employees\/imports\.js'\)/g, "import('./imports.js')");
fs.writeFileSync(empIndexPath, empIdx);
console.log('Fixed employees/index.js dynamic imports');

// Fix 3: Top-level handlers in lib/api/*.js — '../lib/' -> '../' and '../server/' -> '../../server/'
const libApiDir = path.join(process.cwd(), 'lib/api');
const topLevelFiles = fs.readdirSync(libApiDir).filter(f => f.endsWith('.js'));
for (const file of topLevelFiles) {
  const fp = path.join(libApiDir, file);
  let src = fs.readFileSync(fp, 'utf8');
  const before = src;
  src = src.replace(/from '\.\.\/lib\//g, "from '../");
  src = src.replace(/from '\.\.\/server\//g, "from '../../server/");
  src = src.replace(/import\('\.\.\/lib\//g, "import('../");
  if (src !== before) {
    fs.writeFileSync(fp, src);
    console.log('Fixed:', file);
  }
}
console.log('Done.');