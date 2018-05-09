const vscode = require('vscode')
const { workspace, window } = vscode
const http = require('http')

const API = require('cos-api4node') 
const LOG = require( './log' )
const languages = require('./package.json')[ 'contributes' ][ 'languages' ].map( lang => lang.id )
const panel = require( './status-bar-panel' )
const CmdExport = require( './commands/export' )
const { CurrentDoc }= require( './commands/currentdoc' ) 
const IsApiError = require( './is-api-error' ) 



const activate = context => {

    const log = LOG( window )
    const options = workspace.getConfiguration( 'cos' )
    const conn = options.get( 'conn' )
    conn.toString = function(){
        return JSON.stringify( 
            Object.assign( {}, conn, {
                password: "***" //hide passw 
            }),
            null, //replacer
            4 //space
        )
    }

    const api = API( conn )

    api.headServer( err => {

        if ( err ) return log( 'Connection FAILED: ' + conn )
        log( 'Connected ' + conn )
        panel.set( conn )

    })

    const exportTo = options.get( 'export' )
    exportTo.root = workspace.rootPath

    const { exportAll, ExportDoc } = CmdExport({ api, log, options: exportTo })
    const currentDoc = CurrentDoc({ window, languages, log })

    const Save = ({ name, log }) => ( err, data ) => {

        // IsApiError, ExportDoc - global
        const isGetDocError = IsApiError( name, 'getDoc', log )
        if ( isGetDocError({ err, data }) ) return

        const completed = () => log( 'Completed.' )
        const exportDoc = ExportDoc( { name, cat: data.result.cat }, completed )

        exportDoc( { err, data } )
    }

    const Export = ( { api, name, log } ) => ( err, data ) => { 
        // IsApiError, Save - from upper scope
        const isCompileError = IsApiError( name, 'compile', log )
        if ( isCompileError({ err, data }) ) return;
        // after compilation API returns updated storage definition
        // but, currently, we don`t have any AST implementation
        // so, just export again
        data.console.forEach( ci => log( ci ) ) //output compilation log
        //log( ` Export ${ name }` )
        const save = Save( { name, log } )
        api.getDoc( name, save )
    }

    const Compile = ( { api, name, log } ) => ( err, data ) => {

        // IsApiError, Export
        const isImportError = IsApiError( name, 'import', log )
        if ( isImportError({ err, data }) ) return;

        const exportCurrent = Export( { api, name, log } )
        //log( `Compile ${ name }` )
        api.compile( name, exportCurrent )

    }

    // import -> compile -> export
    // save to server, compile, export to disk
    const importCompileExport = () => {

        // api, Compile, log
        const { name, content, error } = currentDoc()
        if ( error ) return log( error )

        const compile = Compile({ api, name, log } )
        //log( ` Import ${ name }` )
        api.putDoc( name, 
                { enc: false, content }, 
                { ignoreConflict: true }, 
            compile 
        )

    }

    context.subscriptions.push(
        vscode.commands.registerCommand( 'cos.compile', importCompileExport ),  
        vscode.commands.registerCommand( 'cos.export', exportAll )
    )

}

module.exports = { activate, deactivate: () => {} }