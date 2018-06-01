/**
* Import and compile current file.
*/
const clsRegexName = require( './cls-regex-name' )
const clsCheckNames = require( './cls-check-names' )
const rtnRegexName = require( './rtn-regex-name' )
const rtnCheckNames = require( './rtn-check-names' )

// extract and verify name of active document
// env - environment { window, languages, log }
// return { name, content, error }
const CurrentDoc = env => () => {

    /*
    env ={
        window = {},
        languages = [ 'cacheobjectscript', 'cacheobjectscriptinclude' ],
        log = data => console.log( 'cos.compile:', JSON.stringify( data ) )
    }
    */
    const { window, languages, log } = env
    const editor = window.activeTextEditor
    if ( !editor ) return {
        error: 'No active editor, open one at first'
    }

    const doc = editor.document
    if ( !doc ) return {
        error: 'Open ObjectScript file first.'
    }

    const fullname = doc.fileName
    if ( !fullname ) return {
        error: 'You must save the document first'
    }

    if ( !~languages.indexOf( doc.languageId ) ) return {
        error: `${ fullname } has unsupported type ${ language }`
    }

    let file = ( fullname.match( /[^\\\/]+$/ ) || [] )[ 0 ] || '' //only filename without folders
    let code = doc.getText()
    let ncode = code.replace( /\/\/[^\r\n]*\r?\n/g, '' ) // normalize EOL?
    let name, ext, codename //server side name

    const cdnm = ({name,ext})=>[name, ext].join('.')

    if ( /\.cls$/i.test( fullname ) ) { // is class?

        ( { name, ext } = clsRegexName( ncode ) )
        codename = cdnm({ name, ext })
        if ( !clsCheckNames( { code: codename, file, log } ) ) return {
            error: 'check names'
        }

    } else { // routines

        ( { name, ext } = rtnRegexName( ncode ) )
        codename = cdnm({ name, ext })
        if ( !rtnCheckNames( { code: codename, file, log } ) ) return {
            error: 'check names'
        }
    }

    return {
        name: codename,
        content: code.split( /\r?\n/g ), // get code lines array
        error: '',
        fileName: fullname
    }

}

module.exports = { CurrentDoc }
