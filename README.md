# vscode-cos
Initial [Cache](http://www.intersystems.com/our-products/cache/cache-overview/) ObjectScript ( COS ) language support for Visual Studio Code

## Features

![example](images/screenshot.png)
- Connect to Caché instance via Atelier API ( edit 'cos' section in File - Preferences - Settings  )
- Export sources ( press Ctrl+Shift+P, type 'cos', press Enter ) 

## Notes
For Caché instance with maximum security level, add %Development role for /api/atelier/ web-application ( [More]( https://community.intersystems.com/post/using-atelier-rest-api) )

Language support based on https://github.com/RustamIbragimov/atom-language-cos