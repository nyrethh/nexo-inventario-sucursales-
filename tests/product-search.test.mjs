import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {webcrypto} from 'node:crypto';

// DOM mínimo para probar los eventos del componente sin abrir un servidor.
class Element extends EventTarget {
    children = [];
    attributes = new Map();
    value = '';
    hidden = true;
    validationMessage = '';
    setAttribute(name,value) { this.attributes.set(name,value); }
    removeAttribute(name) { this.attributes.delete(name); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children=[...children]; }
    setCustomValidity(message) { this.validationMessage=message; }
    scrollIntoView() {}
    focus() {}
}

test('El producto de una entrada se elige por búsqueda y escribir de nuevo invalida la selección',()=>{
    const input=new Element(), results=new Element(), feedback=new Element(), selected=new Element();
    const elements={'input':input,'[role=listbox]':results,'[role=status]':feedback,'.serial-selected':selected};
    const container={
        innerHTML:'',
        querySelector:selector=>elements[selector],
        contains:element=>Object.values(elements).includes(element),
        replaceChildren(){ selected.replaceChildren();results.replaceChildren(); }
    };
    const document=new EventTarget();
    document.createElement=()=>new Element();
    const context=createContext({document,AbortController,crypto:webcrypto});
    runInContext(readFileSync(new URL('../public/serial-picker.js',import.meta.url),'utf8'),context);
    const changes=[];
    const picker=context.NexoSerialPicker.mountProduct(container,{
        products:[
            {code:'MOT001',name:'GN 150 Azul'},
            {code:'MOT002',name:'Águila 150 Roja'},
            {code:'MOT003',name:'Forza 200'}
        ],
        onChange:code=>changes.push(code)
    });
    assert.equal(changes.at(-1),'');
    assert.ok(input.validationMessage);
    input.value='aguila roja';
    input.dispatchEvent(new Event('input'));
    assert.equal(results.children.length,1);
    results.children[0].dispatchEvent(new Event('click'));
    assert.equal(changes.at(-1),'MOT002');
    assert.equal(input.validationMessage,'');
    assert.match(selected.children[0].children[0].textContent,/Águila 150 Roja/);
    assert.equal(selected.children[0].children.length,2);
    input.value='MOT003';
    input.dispatchEvent(new Event('input'));
    assert.equal(changes.at(-1),'');
    assert.ok(input.validationMessage);
    assert.equal(results.children.length,1);
    const down=new Event('keydown',{cancelable:true});down.key='ArrowDown';input.dispatchEvent(down);
    const enter=new Event('keydown',{cancelable:true});enter.key='Enter';input.dispatchEvent(enter);
    assert.equal(changes.at(-1),'MOT003');
    selected.children[0].children[1].dispatchEvent(new Event('click'));
    assert.equal(changes.at(-1),'');
    input.value='ningun modelo';
    input.dispatchEvent(new Event('input'));
    assert.equal(results.children.length,0);
    assert.equal(results.hidden,true);
    assert.match(feedback.textContent,/No hay productos/);
    picker.destroy();
    input.value='GN';
    input.dispatchEvent(new Event('input'));
    assert.equal(results.children.length,0);
});
