/**
* Import and compile current file.
*/
const clsRegexName = require( './cls-regex-name' )
const clsCheckNames = require( './cls-check-names' )
const rtnRegexName = require( './rtn-regex-name' )
const rtnCheckNames = require( './rtn-check-names' )
const IsError = require( './is-error' )

// will be overriden in module.exports
let window = {}
let languages = [ 'cacheobjectscript', 'cacheobjectscriptinclude' ];
let api = { putDoc: () => {},  compile: (  ) => {} }
let log = data => console.log( 'cos.compile:', JSON.stringify( data ) )

module.exports = env => {

    ({ window, languages, api, log } = env );

    return () => {

        const editor = window.activeTextEditor
        if ( !editor ) return log( 'No active editor, open one at first' )
        const doc = editor.document
        if ( !doc ) return log( 'Open ObjectScript file first.' )
        const fullname = doc.fileName
        if ( !fullname ) return log( 'You must save the document first' )
        if ( !~languages.indexOf( doc.languageId ) ) {
            return log( `${ fullname } has unsupported type ${ language }` )
        }

        let file = ( fullname.match( /[^\\\/]+$/ ) || [] )[ 0 ] || '' //only filename without folders
        let code = doc.getText().replace( /\/\/[^\r\n]*\r?\n/g, '' ) // normalize EOL?
        let name, ext, codename //server side name

        const cdnm = ({name,ext})=>[name, ext].join('.')

        if ( /\.cls$/i.test( fullname ) ) { // is class?

            ( { name, ext } = clsRegexName( code ) )
            codename = cdnm({ name, ext })
            if ( !clsCheckNames( { code: codename, file, log } ) ) return

        } else { // routines

            ( { name, ext } = rtnRegexName( code ) )
            codename = cdnm({ name, ext })
            if ( !rtnCheckNames( { code: codename, file, log } ) ) return

        }

        const content = code.split( /\r?\n/g ), // code lines array
            isCompileErrors = IsError({ codename, action: 'compile', log }), 
            compile = () => api.compile( codename, ( err, res ) => {
                if ( isCompileErrors( err, res ) ) return
                res.console.forEach( l => l ? log( l ) : 0 )
            }),
            isSaveErrors = IsError({ codename, action: 'save', log })

        log( `
Save and compile ${ fullname } ...` 
        )
        api.putDoc(  codename, { enc: false, content }, { ignoreConflict: true }, ( err, res ) => {
            if ( isSaveErrors( err, res ) ) return
            compile()
        })

    }

}