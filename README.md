[![Known Vulnerabilities](https://snyk.io/test/github/daimor/vscode-objectscript/badge.svg)](https://snyk.io/test/github/daimor/vscode-objectscript)
[![Gitter](https://badges.gitter.im/daimor/vscode-objectscript.svg)](https://gitter.im/daimor/vscode-objectscript?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)
[![Liberpay](https://img.shields.io/liberapay/receives/daimor.svg?logo=liberapay)](https://liberapay.com/daimor/donate)
[![](https://img.shields.io/visual-studio-marketplace/i/daimor.vscode-objectscript.svg)](https://marketplace.visualstudio.com/items?itemName=daimor.vscode-objectscript)

[![](https://img.shields.io/badge/InterSystems-IRIS-blue.svg)](https://www.intersystems.com/products/intersystems-iris/)
[![](https://img.shields.io/badge/InterSystems-Caché-blue.svg)](https://www.intersystems.com/products/cache/)
[![](https://img.shields.io/badge/InterSystems-Ensemble-blue.svg)](https://www.intersystems.com/products/ensemble/)

# vscode-objectscript

[InterSystems](http://www.intersystems.com/our-products/) ObjectScript language support for Visual Studio Code

## Features

- Initial InterSystems ObjectScript code highlighting support.
  ![example](https://raw.githubusercontent.com/daimor/vscode-objectscript/master/images/screenshot.png)
- Export existing sources to the working directory: press Ctrl+Shift+P, type 'ObjectScript', press Enter.
- Save and compile a class: press Ctrl+F7 (⌘+F7) or select "ObjectScript: Save and compile" from Ctrl+Shift+P menu.
- Server Explorer with possibility to export items![ServerExplorer](https://raw.githubusercontent.com/daimor/vscode-objectscript/master/images/explorer.png)

## Installation

Install [Visual Studio Code](https://code.visualstudio.com/) first.

Open VSCode. Go to extensions and search for "ObjectScript" like it is shown on the attached screenshot and install it.
Or install from ObjectScript extension page on [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=daimor.vscode-objectscript)
![installation](https://raw.githubusercontent.com/daimor/vscode-objectscript/master/images/installation.gif)

## Configure connection

To be able to use many plugin features, you need to configure the connection to Caché server first.

- Find a 'objectscript.conn' section in workspace settings (File - Preferences - Settings), do not forget to set `active` to `true`
  `port` should follow to web port of instance (usually by default, 57772 for Caché/Ensemble, 52773 for IRIS)
  ```JSON
  "objectscript.conn": {
    "active": true,
    "label": "LOCAL",
    "host": "127.0.0.1",
    "port": 52773,
    "username": "user",
    "password": "password",
    "ns": "USER",
    "https": false
  }
  ```
- Change settings according to your Caché/IRIS instance
- You will see related output in "Output" while switched to "ObjectScript" channel (right drop-down menu on top of the output window)

## Notes

For Caché/IRIS instance with maximum security level, add '%Development' role for '/api/atelier/' web-application ( [More](https://community.intersystems.com/post/using-atelier-rest-api) )
