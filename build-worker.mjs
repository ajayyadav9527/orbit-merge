import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
const types={
 'index.html':'text/html; charset=utf-8',
 'style.css':'text/css; charset=utf-8',
 'app.js':'text/javascript; charset=utf-8',
 'engine.js':'text/javascript; charset=utf-8',
 'ads.js':'text/javascript; charset=utf-8',
 'robots.txt':'text/plain; charset=utf-8',
 'sitemap.xml':'application/xml; charset=utf-8',
 'app_icon.png':'image/png',
 'app_icon_favicon.png':'image/png',
 'app_icon_touch.png':'image/png',
 'game_banner.png':'image/png'
};
const assets={};
for(const [name,type] of Object.entries(types)){
 const destination='dist/'+name;
 await copyFile(name,destination);
 const data=await readFile(destination);
 assets['/'+name]=type==='image/png'
  ?{base64:data.toString('base64'),type}
  :{body:data.toString('utf8'),type};
}
const source=await readFile('worker/index.mjs','utf8');await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});await writeFile('dist/server/index.js',source+'\nexport default makeWorker('+JSON.stringify(assets)+');\n');await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json','utf8'));console.log('Worker and embedded game assets built.');
