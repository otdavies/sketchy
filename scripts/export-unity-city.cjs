// The same geometry feeds the browser and Unity comparison scene.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'src/web/city-geometry.js'), 'utf8'), context);
const vertices = vm.runInContext('buildPencilCityGeometry(false, false)', context);
const casters = vm.runInContext('buildPencilCityGeometry(false, true)', context);
const target = path.join(root, 'Packages/com.otdavies.sketchy/Samples~/ReferenceCity/City.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify({ vertices, casters }) + '\n');
console.log(`Exported ${vertices.length / 7} city vertices.`);
