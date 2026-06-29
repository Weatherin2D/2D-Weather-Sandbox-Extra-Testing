const fs = require('fs');
const b = fs.readFileSync('shaders/fragment/boundaryShader.frag','utf8').split(/\r?\n/);
const c = fs.readFileSync('shaders/common.glsl','utf8').split(/\r?\n/);
const out=[];
for(const line of b){ if(line.trim() === '#include "common.glsl"'){ out.push(...c); } else { out.push(line); } }
const stack=[];
for(let i=0;i<out.length;i++){
  const line=out[i];
  for(const ch of line){
    if(ch==='{' ) stack.push({line:i+1,text:line});
    else if(ch==='}'){
      if(stack.length) stack.pop();
      else console.log('unmatched close', i+1, line);
    }
  }
}
console.log('unmatched opens', stack.length);
for(const item of stack) console.log('open at', item.line, item.text);
