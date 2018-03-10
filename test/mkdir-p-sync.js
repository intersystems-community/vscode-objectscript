const test = require( 'tape' )
const fs = require( 'fs' )
const mkdir = require( './../commands/export/mkdir-p-sync' )

test( 'mkdir-p-sync', assert => {

    const random = new Date().getTime() + ''
    const testdir =  `${__dirname}/commands/export/${random}`
    mkdir( testdir )

    const expected = true
    const actual =  fs.existsSync( testdir )

    assert.equal( actual, expected, `mkdir -p ${testdir}` )
    assert.end()

});