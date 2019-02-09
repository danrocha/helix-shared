/*
 * Copyright 2018 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-env mocha */
/* eslint-disable max-len,array-callback-return */

const assert = require('assert');
const { JSDOM } = require('jsdom');
const { each } = require('../src/index.js').sequence;
const {
  parentNodes, equalizeNode,
  nodeIsEquivalent, assertEquivalentNode,
} = require('../src/index.js').dom;

describe('parentNodes', () => {
  const win = new JSDOM('<div><div><span><div><p>foo').window;

  const children = [win.document.documentElement];
  let elm = win.document.body;
  while (elm && elm.nodeName !== '#text') {
    children.push(elm);
    elm = elm.firstChild;
  }

  const ck = (element, expected) => {
    // parentNodes() endswith expected.reverse()
    const parents = Array.from(parentNodes(element));
    each(expected.reverse(), (node) => {
      assert(node.isSameNode(parents.shift()));
    });
  };

  it('Determines parents', () => {
    ck(win.document.querySelectorAll('p')[0].firstChild, children);
    ck(win.document, []);
    ck(win.document.documentElement, []);
    ck(win.document.body, [win.document.documentElement]);
    ck(win.document.createElement('div'), []);
  });

  it('Rejects invalid inputs', () => {
    const dom = new JSDOM('');
    each([dom.window, dom, '', {}, 22, undefined, null, '<p></p>'], (v) => {
      assert.throws(() => parentNodes(v).next());
    });
  });
});

describe('equalizeNode()', () => {
  const ck = (msg, ...rest) => {
    const inputs = rest;
    const expected = rest.pop();
    each(inputs, (inp) => {
      it(msg, () => {
        const dom = new JSDOM(inp).window.document;
        equalizeNode(dom);
        assert.strictEqual(dom.body.innerHTML, expected);
      });
    });
  };

  ck('empty dom is noop', '', '');
  ck('empty dom containing space has space trimmed', '   \n  ', '');
  ck('removes comments',
    '<!-- Hello World -->',
    '');
  ck('removes comments buried deep',
    '<div><span><div><!-- Hello World --></div></span></div>',
    '<div><span><div></div></span></div>');
  ck('space in text is collapsed',
    'Foo\n  \n \tBar',
    'Foo Bar');
  ck('text is trimmed',
    '   Foo\n  \n \tBar   ',
    'Foo Bar');
  ck('collapses whitespace inside elements',
    '<div>   foo <div>\n   bar <div\n> baz   \n bang',
    '<div>foo<div>bar<div>baz bang</div></div></div>');
  ck('preserves one collapsed space across inline elements (left)',
    '<div>   foo <b> hello  </b> </div>   ',
    '<div>foo<b> hello',
    '<div>foo <b>hello',
    '<div>foo<b>\nhello',
    '<div>foo\n<b>\nhello',
    '<div>foo\n<b>hello',
    '<div>foo\t<b>hello',
    '<div>foo\t<b>\thello',
    '<div>foo <b>hello</b></div>');
  ck('preserves one collapsed space across inline elements (right)', '<div>   <em> hello</em> foo ',
    '<div><em> hello </em>  foo',
    '<div> <em>hello\n</em> foo',
    '<div><em>\nhello</em>\nfoo',
    '<div>\n<em>\nhello\n</em>\nfoo',
    '<div>\n<em>hello</em>\tfoo',
    '<div>\t<em>hello\n</em> foo',
    '<div><em>hello</em> foo</div>');
  ck('preserves one collapsed space across inline elements (both)',
    '<div> foo   <span> hello</span> foo ',
    '<div> foo<span> hello </span>  foo',
    '<div> foo <span>hello\n</span> foo',
    '<div> foo<span>\nhello</span>\nfoo',
    '<div> foo\n<span>\nhello\n</span>\nfoo',
    '<div> foo\n<span>hello</span>\tfoo',
    '<div> foo\t<span>hello\n</span> foo',
    '<div>foo <span>hello</span> foo</div>');
  ck('preserves one collapsed space across inline elements (parent)',
    '<a>Hello \t\n </a>   \n   <span>  \n\t  world',
    '<a>Hello \t\n </a><span>  \n\t  world',
    '<a>Hello</a><span>  \n\t  world',
    '<a>Hello </a><span>world',
    '<a>Hello</a>  <span>world',
    '<a>Hello</a><span>  world',
    '<a>Hello</a><span>\nworld',
    '<a>Hello\n</a><span>\nworld',
    '<a>Hello</a> <span>world</span>');
  ck('preserves one collapsed space across inline elements (parent, unbalanced, nested)',
    '<a><span><b>foo</b>\n</span></a><b>hello</b>',
    '<a><span><b>foo</b></span></a> <b>hello</b>');
  ck('cuts space around block elements',
    ' foo \n<div></div> bar',
    'foo<div></div>bar');
  ck('leaves <pre> alone',
    ' foo <pre> \n \t   </pre> bar ',
    'foo<pre> \n \t   </pre>bar');
  ck('can deal with inline css',
    'foo <span style="display: block; white-space: pre;"> \n \t   </span> bar',
    'foo<span style="display: block; white-space: pre;"> \n \t   </span>bar');
  ck('can deal with external css',
    '<style>.foo { white-space: pre; }</style>'
     + '   <span class="foo">     hello world   </span> ',
    '<span class="foo">     hello world   </span>');
  ck('preserves collapsed space around inline pre',
    ' foo \n<pre style="display: inline"> \n \t   </pre>\tbar ',
    'foo <pre style="display: inline"> \n \t   </pre> bar');
  ck('preserves collapsed space inside non-pre inside pre',
    '   <pre><span style="white-space: normal">    \t hello \n</span></pre> \n',
    '<pre><span style="white-space: normal"> hello </span></pre>');
  ck('strips spaces between two divs',
    '<div> foo </div> \n <div> bar \n </div>',
    '<div>foo</div><div>bar</div>');
  ck('strips spaces after nested div',
    '<div>   <div> Hello World </div>    </div>',
    '<div><div>Hello World</div></div>');
  ck('strips spaces between inline elements inside div',
    '<div>  <a > foo </a><span>  \n<em> borg</em></span><b>  <em> baz </em>  </b> </div>',
    '<div><a>foo</a> <span><em>borg</em></span> <b><em>baz</em></b></div>');
  ck('allows empy inline element inside pre',
    '<pre> <span></span> </pre>',
    '<pre> <span></span> </pre>');
  ck('collapses spaces inside inline element inside pre',
    '<pre> <span>   \n </span> </pre>',
    '<pre> <span> </span> </pre>');
  // ck('collapses spaces between inline pre and text at the end of a div',
  //   '<div>foo</foo><div>   <pre style="display: inline"> hello</pre>  \n \n \t foo </div>',
  //   '<div>foo</foo><div><pre style="display: inline"> hello</a> foo</div>');

  const style = `
    <style>
      mypro {
        display: inline;
        white-space: pre;
      }
      mynom {
        display: inline;
        white-space: normal;
      }
    </style>`;

  const grandBody = `
    <div> Hello    World </div>
    <div> Hello
        World </div>
    <div> Hello    World </div>
    <div>
      <!-- Hello World -->
      <span     >Hello</span>
      world
      <div
      > xxx </div>
      <pre>   </pre>
      <a>you are my </a>
      <a> <span>


          sunshine</span> </a>

      <mypro> <!-- foo --> <mynom>
        <!-- Nomnomnom -->
        <!-- Nomnomnom -->
        Hello                       World
        <pre style="display: inline"> Fofofo <mynom>
          We are the borg
        </mynom> my dear </pre></mynom>fnord</mypro>
      foo
      <!-- Nomnomnom -->
      <!-- Nomnomnom -->
    </div>`;

  const grandResult = ''
    + '<div>Hello World</div>'
    + '<div>Hello World</div>'
    + '<div>Hello World</div>'
    + '<div>'
      + '<span>Hello</span> world'
      + '<div>xxx</div>'
      + '<pre>   </pre>'
      + '<a>you are my</a> <a><span>sunshine</span></a> <mypro>  '
        + '<mynom> Hello World '
          + '<pre style="display: inline"> Fofofo '
            + '<mynom> We are the borg </mynom> '
          + 'my dear '
        + '</pre>'
      + '</mynom>fnord</mypro> foo'
    + '</div>';

  ck('grand test with all features combined', `
      <head>${style}</head>
      <body>${grandBody}  ${grandBody} ${grandBody}  </body>  `,
  `${grandResult}${grandResult}${grandResult}`);

  it('Rejects invalid inputs', () => {
    const dom = new JSDOM('');
    each([dom.window, dom, '', {}, 22, undefined, null, '<p></p>'], (v) => {
      assert.throws(() => equalizeNode(v));
    });
  });
});

describe('dom equivalence nodeIsEquivalent(), assertEquivalentNode()', () => {
  const docA = new JSDOM('<p b="23" a=42  >Hello World</p>');
  const docB = new JSDOM(' <p a="42" b=23>Hello World</p>');
  const docC = new JSDOM('<body>\n<p a=42 b=23>Hello World</p></body>');
  const docD = new JSDOM('<html><head></head><body>   <p b=23\n a=42>Hello World</p></body>');

  const assertEq = (actual, expected) => {
    assertEquivalentNode(actual, expected);
    assert(nodeIsEquivalent(actual, expected));
  };
  const assertNEq = (actual, expected) => {
    assert.throws(() => assertEquivalentNode(actual, expected));
    assert(!nodeIsEquivalent(actual, expected));
  };
  const assertThrows = (actual, expected) => {
    assert.throws(() => assertEquivalentNode(actual, expected));
    assert.throws(() => nodeIsEquivalent(actual, expected));
  };

  it('Can compare empty documents', () => {
    assertEq(new JSDOM('').window.document, new JSDOM('').window.document);
    assertEq(new JSDOM('   ').window.document, new JSDOM('').window.document);
    assertEq(new JSDOM('   ').window.document, new JSDOM().window.document);
  });

  it('Can compare multiple string representations of the same dom', () => {
    each([docB, docC, docD], (v) => {
      assertEq(v.window.document, docA.window.document);
      assertEq(v.window.document.body, docA.window.document.body);
      assertEq(v.window.document.documentElement, docA.window.document.documentElement);
    });
  });

  it('Rejects unequal dom trees', () => {
    assertNEq(docA.window.document.documentElement, docA.window.document);
    assertNEq(docA.window.document.body, docA.window.document.documentElement);
    assertNEq(docA.window.document.body, docA.window.document);
  });

  it('Rejects objects that are not dom nodes', () => {
    each([docA.window, docB, '', {}, 22, undefined, null, '<p></p>'], (v) => {
      assertThrows(v, docA.window.document);
      assertThrows(docB.window.document, v);
      assertThrows(v, v);
    });
  });

  it('Compares whitespace in <pre></pre> elements', () => {
    const preA = new JSDOM('<pre></pre>');
    const preB = new JSDOM('<pre> </pre>');
    const preC = new JSDOM('<pre>\t</pre>');
    each([preB, preC], v => assertNEq(v.window.document, preA.window.document));

    // Firefox, JSDOM and Chromium consider <pre></pre>
    // to be equal <pre>\n<pre>
    const preD = new JSDOM('<pre>\n</pre>');
    assertEq(preA.window.document, preD.window.document);
  });
});