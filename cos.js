const vscode = require('vscode')
const workspace = vscode.workspace
const window = vscode.window
const API = require('cos-api4node') 
const fs = require('fs')
const pkg = require('./package.json')

const COS_LANG_IDS = pkg[ 'contributes' ][ 'languages' ].map( lang => lang.id )

const createBar = () => {
    
    const left = vscode.StatusBarAlignment.Left
    const server = vscode.window.createStatusBarItem( left )
    // server.command = "cos.server"
    server.show()
    
    return { 
        set: conn => { server.text = `${conn.label}:${conn.ns}` }
    }
}

const activate = context => {
    
    const bar = createBar()
    
    const output = window.createOutputChannel( 'cos' )
    
    const log = msg => { 
        output.appendLine( msg ) 
        return true 
    }
    
    const conn = workspace.getConfiguration( 'cos' ).get( 'conn' )
    
    const api = API( conn )
    
    api.headServer( ( err ) => {

        const connectionParameters = JSON.stringify( 
            Object.assign({}, conn, {
                password: "***"
            }),
            null,
            4
        );
        if ( !!err ) return log( 'Connection FAILED: ' + connectionParameters )
        log( 'Connected ' + connectionParameters )
        bar.set( conn )

    })

    /**
     * Import and compile current file.
     */
    const cosCompile = () => {

        if ( !window.activeTextEditor )
            return log( 'No active editor, open one at first' )

        const openedDoc = window.activeTextEditor.document

        if ( !openedDoc )
            return log( 'Open a Caché ObjectScript file first.' )

        const fileName = openedDoc.fileName;

        if ( !fileName || COS_LANG_IDS.indexOf(openedDoc.languageId) === -1 )
            return log( `Document ${ fileName } cannot be compiled in Caché (type ${ openedDoc.languageId } unsupported)` )

        log( `Saving ${ fileName }...` )

        let cacheDocName;
        const fileBody = openedDoc.getText()
        const isClass = /\.cls$/i.test( fileName )
        const content = fileBody.split( /\r?\n/g )
	    const matchingFileName = ( fileName.match(/[^\\\/]+$/) || [] )[ 0 ] || ''
        const matchingName = matchingFileName.replace( /\.[^.]+$/, '' )

        if ( isClass ) {

            // Caché class files can be placed hierarchically (e.g. /src/Package/Class.cls),
            // so we pick the class name from the class definition itself
            cacheDocName = (fileBody.replace( /\/\/[^\r\n]*\r?\n/g, '' ).match( /Class ([^\s]+)/i ) || [])[ 1 ] || ''
            const nameParts = cacheDocName.split( /\./g ).filter(s => !!s)
            if ( nameParts.length < 2 )
                return log( `Unable to detect class name in source code of ${ fileName }.\n`
                    + `Is it a valid Caché ObjectScript class?` )
            if ( ( cacheDocName.toLowerCase() + '.cls' ).indexOf( matchingFileName.toLowerCase() ) === -1 )
                return log(
                    `You tried to compile class named "${ cacheDocName }" in file "${ matchingFileName }".\n`
                    + `Did you forget to rename the file/class to correspond to each other?`
                )
            cacheDocName += '.cls'

        } else {

            // routine: routine name must be declared in a routine
            const cleanup = fileBody.replace( /\/\/[^\r\n]*\r?\n/g, '' )
	        cacheDocName = ( cleanup.match( /routine ([^\s]+)/i ) || [] )[ 1 ] || ''
	        if ( !cacheDocName )
		        return log(
		            `Unable to detect routine name in source code of ${ matchingFileName }.\n`
			        + `Is it a valid Caché ObjectScript routine? Did you forget to define a routine`
                    + ` name in the file on the first line? Routine code example: \n\n`
                    + `ROUTINE ${ matchingName } [Type=MAC]`
                    + `\n    write "routine code here"\n    quit`
                )
            const rtnType = ( cleanup.match( /routine\s+[^\s]+\s+\[.*type=([a-z]{3,})/i ) || [] )[ 1 ] || 'MAC'
            if ( ( ( cacheDocName + '.' + rtnType ).toLowerCase() ).indexOf( matchingFileName.toLowerCase() ) === -1 )
                return log(
	                `You tried to compile routine named "${ cacheDocName }" (.${ rtnType }) in file "${ 
                        matchingFileName }".\nDid you forget to rename the file/routine to correspond to each other? `
                    + `Routine code example: \n\n`
                    + `ROUTINE ${ matchingName } [Type=${ rtnType }]`
                    + `\n    write "routine code here"\n    quit`
                )
            cacheDocName += '.' + rtnType

        }

        const anyErrors = (err, res, keyword) => {

            if ( err )
                return log( `Unable to ${ keyword } ${ cacheDocName }: ${ err.code ? err.code + ' ' + err.message : err  }` )
        
            if ( !res || !res.status || !(res.status.errors instanceof Array) )
                return log( `Unknown response from Atelier API while trying to ${ 
                    keyword } ${ cacheDocName }: ${ res }` )

            if ( res.result && res.result.status )
                return log( res.result.status )

            if ( res.status.errors.length !== 0 )
                return log( `Unable to ${ keyword } ${ cacheDocName }: ${ res.status.errors.summary }\n\n${ 
                    res.console }\n\n${ res.status.errors.join('\n') }` )

            return false;

        }

        const consoleOutput = (output, defaultOutput = "") => {
            
            let out = output instanceof Array
                ? output.join( '\n' ) 
                : ( output || defaultOutput ) + '';
            out = out.replace( /^[\s\r\n]+/, '' );

            if ( out ) {
                log( out )
            }

        }

        api.putDoc( cacheDocName, { enc: false, content }, { ignoreConflict: true }, ( err, res ) => {
            
            if ( anyErrors( err, res, 'save' ) )
                return;

            consoleOutput( res.console )

            api.compile( cacheDocName, ( err, res ) => {

                if ( anyErrors( err, res, 'compile' ) )
                    return;

                consoleOutput( res.console || "Done." )

            } )

        } )

    }
    
    /**
     * Export all classes/routines in a namespace to working directory.
     */
    const cosExport = () => {

        const exportDoc = ( doc, cb ) => {
            
            const root = workspace.rootPath
            if ( typeof root === 'undefined' ){
                log('')
                log('Open folder before export - Ctrl+K, Ctrl+O')
                return cb()
            }

            let exportDir = root + '/src/' 
            if ( !fs.existsSync( exportDir ) ) fs.mkdirSync( exportDir )
            exportDir += doc.cat + '/'
            if ( !fs.existsSync( exportDir ) ) fs.mkdirSync( exportDir )

            const filepath = exportDir + doc.name
            fs.writeFileSync( filepath, doc.content.join('\n') )
                        
            
            log( doc.name + ' -> ' + filepath )
            cb( null, {} )

        }

        const load = ( doc, cb )  => {
           
            const loaded = ( err, json ) => { 
                
                if ( !!err ) {
                    
                    log('')
                    log( 'ERROR!!!:  ' + doc.name + JSON.stringify( err ) ) 
                    log('')
                    return cb( err )

                }

                const content = json.result
                exportDoc( content, cb )

            }

            api.getDoc( encodeURI(doc.name), loaded )

       }

       const exportDocs = ( docs, cb ) => {
           const doc = docs.shift()
           if (!doc ) return cb()
           
           load( doc, ( err, data )=>{ 
                if ( err ) log( 'ERROR: ' + JSON.stringify(doc) + ' ' + JSON.stringify( err ) )
                exportDocs( docs, cb ) //continue
           })
       }


       const onGetDocs = ( err, json ) => {
            
            if ( err ) return log( 'getDocs ERROR' )
            
            const list = json.result.content
            log( '' )
            log( 'list: ' + list.length )
            const docs = list.filter( doc => ( doc.cat !== 'CSP' ) && ( doc.name.substring( 0, 1 ) !== '%' ) && ( doc.name.substring( 0, 12 ) !== 'INFORMATION.' ) ) 
            log( 'without % and CSP and INFORMATION: ' + docs.length )
            log( '' )
            exportDocs( docs, () => {
                log( '' )
                log( 'Export completed.' )
            })

        }

        api.getDocNames( { generated: 0 }, onGetDocs )

    }

    // command 'cos.server' defined in statusBar
    context.subscriptions.push(
        vscode.commands.registerCommand( 'cos.export', cosExport ),
        vscode.commands.registerCommand( 'cos.compile', cosCompile )
    )
    
}

module.exports = { activate, deactivate: () => {} }