const vscode = require('vscode')
const workspace = vscode.workspace
const window = vscode.window
const API = require('cos-api4node') 
const fs = require('fs')

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
    
    const log = msg => output.appendLine( msg )
    
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
            
            if ( err ) return log( 'getDocs ERROR')
            
            const list = json.result.content
            log( '' )
            log( 'list: ' + list.length )
            const docs = list.filter( doc => ( doc.cat !== 'CSP' ) && ( doc.name.substring( 0, 1 ) !== '%' ) && ( doc.name.substring( 0, 12 ) !== 'INFORMATION.' ) ) 
            log( 'without % and CSP and INFORMATION: ' + docs.length )
            log( '' )
            exportDocs( docs, ()=>{
                log( '' )
                log( 'Export completed.' )
            })

        }

        api.getDocNames( { generated: 0 }, onGetDocs )

    }

    // command 'cos.server' defined in statusBar
    const cmd = vscode.commands.registerCommand( 'cos.export', cosExport )
    context.subscriptions.push( cmd )
    
}

module.exports = { activate, deactivate: () => {} }