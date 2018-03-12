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

// see module.exports
let GetDoc = ( doc, fn ) => {}

// see module.exports
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
const DocExport = ( doc ) => () => {

    if ( !root ){
        const message = 'Open folder before export - Ctrl+K, Ctrl+O'
        const error = { message }
        return { error, data: null }
    }

    // atelier: 'mypkg.subpkg.myclass.cls' => 'mypkg/subpkg/myclass.cls'
    const filename = doc2file( doc.name )
    const fullname = [ root, folder, doc.cat, filename ].join('/')
    const folders = path.dirname( fullname )

    if ( !fs.existsSync( folders ) ) mkdir( folders )
    fs.writeFileSync( fullname, doc.content.join( '\n' ) )

    return { error: null, data: fullname }

}


const Exported = ( doc ) => ( { error, data } ) => {

    if ( error ){
        log('')
        log( `Load ${ doc.name } error: ${ JSON.stringify( error ) }` ) 
        log('')
        return
    }

    log( '' )
    log( `${ doc.name } -> ${ data }` )

}

const Loaded = doc => ( { error, data } ) => { 

    if ( error ){
        return { 
            error: { message: `load ${ doc.name } ERROR: ${ JSON.stringify( err ) }` },
            data: null
        }
    }

    return {
        error: null,
        data: data.result
    }

}

// https://medium.com/javascript-scene/composing-software-an-introduction-27b72500d6ea
const pipe = (...fns) => x => fns.reduce(( y, f ) => f( y ), x );

const docsExport = ( docs, cb ) => {

    let doc, loaded, docExport, exported, getDoc, cb
    while ( doc = docs.shift() ){

        loaded = Loaded( doc )
        docExport = DocExport( doc )
        exported = Exported( doc )
        cb = pipe( loaded, docExport, exported )
        getDoc = GetDoc( doc, cb )

        getDoc()

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

    GetDoc = ( doc, fn ) => api.getDoc( encodeURI( doc.name ), ( error, data ) => fn({ error, data }) )

    if ( atelier ) doc2file = docname => atelier_filename( docname )

    return () => {
        api.getDocNames( { category, generated, filter }, onGetDocs )
    }

}