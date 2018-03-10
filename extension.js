const vscode = require('vscode')
const workspace = vscode.workspace
const window = vscode.window

const API = require('cos-api4node') 
const LOG = require( './log' )

const languages = require('./package.json')[ 'contributes' ][ 'languages' ].map( lang => lang.id )
const panel = require( './status-bar-panel' )

const CmdExport = require( './commands/export' )
const CmdCompile = require( './commands/compile' )


const activate = context => {

    const log = LOG( window )

    const options = workspace.getConfiguration( 'cos' )
    const conn = options.get( 'conn' )
    const api = API( conn )

    api.headServer( ( err ) => {

        const displayConnection = JSON.stringify( 
            Object.assign( {}, conn, {
                password: "***" //hide passw 
            }),
            null, //replacer
            4 //space
        )

        if ( !!err ) return log( 'Connection FAILED: ' + displayConnection )
        log( 'Connected ' + displayConnection )
        panel.set( conn )

    })

    const exportOpts = options.get( 'export' )
    exportOpts.root = workspace.rootPath
    const cosExport = CmdExport({ api, log, options: exportOpts })
    const cosCompile = CmdCompile({ api, log, languages })

    context.subscriptions.push(
        vscode.commands.registerCommand( 'cos.export', cosExport )
        , vscode.commands.registerCommand( 'cos.compile', cosCompile )
    )

}

module.exports = { activate, deactivate: () => {} }