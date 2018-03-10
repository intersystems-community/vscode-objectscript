const test = require('tape')
const doc2file = require('./../commands/export/doc-to-file-as-atelier')

test( 'doc-to-file-as-ateilier', assert => {

  const docname = 'mypackage.subpackage.myclass.cls'
  const expected = 'mypackage/subpackage/myclass.cls'
  const actual = doc2file( docname )

  assert.equal( actual, expected, 'docname to filename' )
  //assert.pass('This test will pass.')
  assert.end()

});