import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'lib/api/employees');
let fixed = 0;

for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.js')) continue;
  const fp = path.join(dir, file);
  let src = fs.readFileSync(fp, 'utf8');
  const before = src;
  // Files live at lib/api/employees/ -> root is 3 levels up
  src = src.replace(/from '\.\.\/\.\.\/lib\//g, "from '../../../lib/");
  src = src.replace(/from '\.\.\/\.\.\/server\//g, "from '../../../server/");
  src = src.replace(/import\('\.\.\/\.\.\/lib\//g, "import('../../../lib/");
  src = src.replace(/import\('\.\.\/\.\.\/server\//g, "import('../../../server/");
  if (src !== before) {
    fs.writeFileSync(fp, src);
    console.log('Fixed:', file);
    fixed++;
  }
}
console.log('Total fixed:', fixed);