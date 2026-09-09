import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { staticFiles } from './files.mjs';
const trip=staticFiles(fileURLToPath(new URL('../trips/',import.meta.url)),'/trips/');
const app=staticFiles(fileURLToPath(new URL('../dist/',import.meta.url)));
const port=Number(process.env.PORT??4173);
createServer((req,res)=>trip(req,res,()=>app(req,res))).listen(port,'127.0.0.1',()=>console.log(`Trip Atlas: http://127.0.0.1:${port}`));
