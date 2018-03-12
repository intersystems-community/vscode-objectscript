const fs = require('fs')
const path = require('path')

//export 'mypkg.subpkg.name.cls' as /mypkg/subpkg/name.cls
const asAtelier = require('./doc-to-file-as-atelier')
const mkdir = require('./mkdir-p-sync') // mkdir -p 'path/to/file'

// see module.exports
let api = {
    getDocNames: ( opts, cb ) => cb( null, {} ),
    getDoc: ( docname, cb ) => cb( null, {} ) 
}

// see module.exports
let log = (...msg) => console.log('cos.export:', ...msg ) 
// export options
let root = '.'
let folder = 'src'
let atelier = false
let doc2file = docname => docname 

// Export one document 
const ExportDoc = ( doc, next ) => ({ error, data }) => {

    if ( error ){
        log( `GETDOC ${ doc.name }: ${ JSON.stringify( error ) }\n` )
        return
    }
    const { content, status } = data.result 

    // atelier: 'mypkg.subpkg.myclass.cls' => 'mypkg/subpkg/myclass.cls'
    const filename = doc2file( doc.name )
    const fullname = [ root, folder, doc.cat, filename ].join('/')
    const folders = path.dirname( fullname )

    if ( !fs.existsSync( folders ) ) mkdir( folders )
    fs.writeFileSync( fullname, ( content || [] ).join( '\n' ) )
    log( `${ doc.name } -> ${ fullname }. ${ status } ` )
    next()

}

const doclist = ( { error, data } ) => {

    if ( error ) return log( `DOCLIST: ${ JSON.stringify(error) }` )
    const list = data.result.content
    log(`Documents on server: ${ list.length }` )

    const docfilter = d => ( d.name.substring( 0, 1 ) !== '%' ) &&
                            ( d.cat !== 'CSP' ) &&
                            ( d.name.substring( 0, 12 ) !== 'INFORMATION.' )

    const filtered = list.filter( docfilter )
    log( `Without CSP, %* and INFORMATION.*: ${ filtered.length}` )

    const next = () => {
        let doc = filtered.shift()
        if ( !doc ) return
        let cb = ExportDoc( doc, next )
        api.getDoc( encodeURI( doc.name ), ( error, data ) => cb( { error, data } ) )
    }
    next()

    log( 'Export completed.\n' )

}

/**
 * Export all classes/routines in a namespace to working directory.
*/
module.exports = environment => {

    //reassign module variables
    ( { api, log, options } = environment ); 
    ( { root, folder, atelier } = options );
    if ( atelier ) doc2file = doc => asAtelier( doc )

    // doclist options 
    const { category, generated, filter } = options;

    return () => {

        if ( !root ){
            log( `COS.EXPORT: Open folder before export - Ctrl+K, Ctrl+O` ) 
            return 
        }
  
        log( 'Load list of documents...' )
        api.getDocNames( 
            { category, generated, filter }, //list options
            ( error, data ) => doclist( { error, data } ) //callback wrapper
        )

    }

}