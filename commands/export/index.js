const fs = require('fs')
const path = require('path')

//export 'mypkg.subpkg.name.cls' as /mypkg/subpkg/name.cls
const atelier_filename = require('./doc-to-file-as-atelier')
const mkdir = require('./mkdir-p-sync') // mkdir -p 'path/to/file'

// see module.exports
let api = {
    getDocNames: ( opts, cb ) => cb( null, {} ),
    getDoc: ( docname, cb ) => cb( null, {} ) 
}
let log = (...msg) => console.log('cos.export:', ...msg ) 
// export options
let root = '.'
let folder = 'src'
let category = '*'
let generated = 0
let filter  = ''
let atelier = false
let doc2file = docname => docname


// Export one document 
const docExport = ( doc, cb ) => {

    if ( !root ){
        log('')
        log('Open folder before export - Ctrl+K, Ctrl+O')
        return cb()
    }

    // atelier: 'mypkg.subpkg.myclass.cls' => 'mypkg/subpkg/myclass.cls'
    const filename = doc2file( doc.name )
    const fullname = [ root, folder, doc.cat, filename ].join('/')
    const folders = path.dirname( fullname )

    if ( !fs.existsSync( folders ) ) mkdir( folders )
    fs.writeFileSync( fullname, doc.content.join( '\n' ) )

    log( `${ doc.name } -> ${ fullname }` )
    cb( null, {} )

}

const Loaded = cb => ( err, json ) => { 

    if ( err ) {
        log('')
        // doc.name ?
        log( `ERROR!!!:  ${ JSON.stringify( err )}` ) 
        log('')
        return cb( err )
    }

    docExport( json.result, cb )

}

const load = ( doc, cb )  => api.getDoc( encodeURI( doc.name ), Loaded( cb ) )

const docsExport = ( docs, cb ) => {

    let doc, loadcb; 
    while ( doc = docs.shift() ){

        loadcb = ( err, data )=> { 
            if ( err ) log( `ERROR: ${ JSON.stringify( doc ) } ${ JSON.stringify( err ) }` )
        }

        load( doc, loadcb )

    }

}

const onGetDocs = ( err, json ) => {
    
    if ( err ) return log( 'getDocs ERROR' )

    const list = json.result.content
    log( '' )
    log( 'list: ' + list.length )
    const docFilter = doc => {
        return ( doc.cat !== 'CSP' ) &&
                 ( doc.name.substring( 0, 1 ) !== '%' ) &&
                 ( doc.name.substring( 0, 12 ) !== 'INFORMATION.' )
    }
    const docs = list.filter( docFilter )
    log( 'without % and CSP and INFORMATION: ' + docs.length )
    log( '' )

    docsExport( docs, () => {
        log( '' )
        log( 'Export completed.' )
    })

}

/**
 * Export all classes/routines in a namespace to working directory.
*/
module.exports = environment => {

    ( { api, log, options } = environment );
    ( { root, folder, atelier, category, generated, filter } = options );
    if ( atelier ) doc2file = docname => atelier_filename( docname )

    return () => {
        api.getDocNames( { category, generated, filter }, onGetDocs )
    }

}