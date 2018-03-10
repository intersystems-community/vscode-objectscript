const fs = require( 'fs' )
// work like linux 'mkdir -p' command
module.exports = path => {

    path.split( '/' ).reduce( ( currentPath, folder ) => {

        currentPath += folder + '/'

        if ( !fs.existsSync( currentPath ) ){
            fs.mkdirSync( currentPath )
        }

        return currentPath

    }, '' )

}