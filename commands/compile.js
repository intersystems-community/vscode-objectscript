const { workspace, window } = require('vscode')

let api = {
    putDoc: () => {}, 
    compile: (  ) => {} 
}

let log = msg => console.log( 'cos.compile:', msg )

// read from package.json, see below
let languages = [ 'cacheobjectscript', 'cacheobjectscriptinclude' ];

const consoleOutput = ( output, defaultOutput = '' ) => {

    const isArr = output instanceof Array
    let out = isArr ? output.join( '\n' ) 
                    : ( output || defaultOutput ) + ''
    ;

    out = out.replace( /^[\s\r\n]+/, '' )

    if ( out ) {
        log( out )
    }

}


const checkEditor = () => {

    if ( !window.activeTextEditor ){
        log( 'No active editor, open one at first' )
        return false 
    }

    const openedDoc = window.activeTextEditor.document
    if ( !openedDoc ){
        log( 'Open a Caché ObjectScript file first.' )
        return false
    }

    const fullname = openedDoc.fileName
    if ( !fullname ){
        log( 'You must save the document first' )
        return false
    }

    const language = openedDoc.languageId
    const supported = ~languages.indexOf( language )
    if ( !supported ){
        log( 
`Document ${ fullname } cannot be compiled in Caché 
( type ${ language } unsupported )` 
        )
        return false
    }

    return true

}


// is name correlate with code ?
// if ( atelier ) {
//  testClass({ codename: 'test.class.cls', filename: 'class.cls' })
// } else {
//  testClass({ codename: 'test.class.cls', filename: 'test.class.cls' })
//}
const testClass = ( { codename, filename }) => {

    const parts = codename.split( /\./g )
                          .filter( s => !!s ) // for codename '.cls'

    if ( parts.length < 3 ) { // 'cls' or empty 
        log( 
`Unable to detect class name in source code of ${ filename }.\n
Is it a valid Caché ObjectScript class?`
        )
        return false
    }

    // NOTE: by default used package 'User'
    // else if ( parts.length === 2 ){
        // parts.unshift( 'User' ) //package by default
        // or need detect 'import' directive
    //}

    const codenameL = codename.toLowerCase()
    const filenameL = filename.toLowerCase()
    const isContain = ~codenameL.indexOf( filenameL )

    if ( !isContain ){ 

        log(
`You tried to compile class named '${ docname }' in file '${ filename }'.\n
Did you forget to rename the file/class to correspond to each other?`
        )
        return false

    }
    return true

}


const testRoutine = ({ codename, filename, type }) => {

    if ( !codename ){

        log(

`Unable to detect routine name in source code of ${ filename }.
Is it a valid Caché ObjectScript routine? Did you forget to define a routine
name in the file on the first line? Routine code example:

ROUTINE RtnName [Type=MAC]
  write "routine code here"
  Quit
`
        )
        return false

    }

    const isContain = ~codename.toLowerCase().indexOf( filename.toLowerCase() ) 
    if ( !isContain ) {
        log(
            `You tried to compile routine named "${ cacheDocName }" (.${ rtnType }) in file "${ 
                matchingFileName }".\nDid you forget to rename the file/routine to correspond to each other? `
            + `Routine code example: \n\n`
            + `ROUTINE ${ matchingName } [Type=${ rtnType }]`
            + `\n    write "routine code here"\n    quit`
        )
        return false
    }

    return true


}

const AnyErrors = codename => ( err, res, keyword ) => {

    if ( err ){
        const errtext = err.code ? err.code + ' ' + err.message : err
        log( `Unable to ${ keyword } ${ codename }: ${ errtext }` )
        return true
    }


    if ( !res || !res.status || !( res.status.errors instanceof Array ) ){
        log( `Unknown response from Atelier API while trying to ${ 
            keyword } ${ codename }: ${ res }` )
        return true
    }

    if ( res.result && res.result.status ){
       log( res.result.status )
       return true
    }

    if ( res.status.errors.length !== 0 ){
        log( 
`Unable to ${ keyword } ${ codename }: ${ res.status.errors.summary }
${res.console }\n\n${ res.status.errors.join('\n') }` 
        )
        return true 
    }

    return false;

}



/**
* Import and compile current file.
*/
const cosCompile = () => {

    if ( !checkEditor() ) return 

    const activedoc = window.activeTextEditor.document
    const fullname = activedoc.fileName
    log( `Saving ${ fullname }...` )

    //drop folders, all after last '/'
    let filename = ( fullname.match( /[^\\\/]+$/ ) || [] )[ 0 ] || ''

    let code = activedoc.getText()
                      .replace( /\/\/[^\r\n]*\r?\n/g, '' ) //normalize eol?

    let codename; //server side name

    const isClass = /\.cls$/i.test( fullname )
    if ( isClass ) {

        // Caché class files can be placed hierarchically (e.g. /src/Package/Class.cls),
        // so we pick the class name from the class definition itself
        const clsrgx = code.match( /Class ([^\s]+)/i ) // rgx = ['Class test.class', 'test.class']
        codename = ( clsrgx || [] )[ 1 ] || '' 
        codename += '.cls' // test.class.cls

        // is name correlate with code ?
        // if ( atelier_way ) {
        //  testClass({ codename: 'test.class.cls', filename: 'class.cls' })
        // } else {
        //  testClass({ codename: 'test.class.cls', filename: 'test.class.cls' })
        //}
        if ( !testClass( { codename, filename } ) ) return

    } else { // routine cases

        // routine: routine name must be declared in a routine
        const rtnrgx = code.match( /routine ([^\s]+)/i ) 
        codename = ( rtnrgx || [] )[ 1 ] || ''
        const type = ( code.match( /routine\s+[^\s]+\s+\[.*type=([a-z]{3,})/i ) || [] )[ 1 ] || 'MAC'
        codename += '.' + type 
        if ( !testRoutine( { codename, filename, type } ) ) return

    }

    const content = code.split( /\r?\n/g ) // code lines
    const anyErrors = AnyErrors( codename )

    const onCompile = ( err, res ) => {
        if ( anyErrors( err, res, 'compile' ) ) return
        consoleOutput( res.console || "Done." )
    }

    const onSave = ( err, res ) => {
        if ( anyErrors( err, res, 'save' ) ) return
        consoleOutput( res.console )
        api.compile( codename, onCompile )
    }

    api.putDoc( 
        codename, 
        { enc: false, content }, 
        { ignoreConflict: true }, 
        onSave 
    )

}

module.exports = env => {

    ({ log, api, languages } = env );
    return cosCompile

}