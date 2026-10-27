const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=readFileSync(__dirname+'/app.js','utf8');
const scope={URL};vm.createContext(scope);
vm.runInContext(source.slice(source.indexOf('function safeUrl('),source.indexOf('function save(')),scope);
const cases=[
 ['rjt100.com','https://rjt100.com/'],
 ['  rjt100.com  ','https://rjt100.com/'],
 ['www.example.com/course?x=1#lesson','https://www.example.com/course?x=1#lesson'],
 ['http://rjt100.com','http://rjt100.com/'],
 ['https://example.com/path','https://example.com/path'],
 ['//example.com/path','https://example.com/path'],
 ['localhost:4173','https://localhost:4173/'],
 ['192.168.1.1:8080','https://192.168.1.1:8080/'],
 ['[::1]:4173','https://[::1]:4173/'],
 ['例子.中国','https://xn--fsqu00a.xn--fiqs8s/'],
 ['javascript:alert(1)',null],['data:text/html,test',null],
 ['ftp://example.com',null],['https://user:password@example.com',null],
 ['hello world',null],['not-a-url',null],['',null],['example..com',null]
];
for(const [input,expected] of cases)assert.equal(scope.safeUrl(input),expected,input);
console.log(`${cases.length} URL normalization and validation cases passed`);
