# vscode-cos
Initial [Cache](http://www.intersystems.com/our-products/cache/cache-overview/) ObjectScript ( COS ) language support for Visual Studio Code

## Features

![example](images/screenshot.png)

### Config connection
- copy 'cos' section from File - Preferences - Settings in workspace settings
- change settings for your Caché instance and reload vscode ( as temporary solution ) 

### Export sources 
press Ctrl+Shift+P, type 'cos', press Enter

## Notes
For Caché instance with maximum security level, add '%Development' role for '/api/atelier/' web-application ( [More]( https://community.intersystems.com/post/using-atelier-rest-api) )

Language support based on https://github.com/RustamIbragimov/atom-language-cos