# Contributing to the ObjectScript extension for Visual Studio Code

## Contributing a pull request

### Prerequisites

1. [Node.js](https://nodejs.org/) 12.x
1. Windows, macOS, or Linux
1. [Visual Studio Code](https://code.visualstudio.com/)
1. The following VS Code extensions:
    - [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
    - [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
    - [EditorConfig for VS Code](https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig)

### Setup

```shell
git clone https://github.com/intersystems-community/vscode-objectscript
cd vscode-objectscript
npm install
```

### Errors and Warnings

TypeScript errors and warnings will be displayed in the `Problems` window of Visual Studio Code.

### Run dev build and validate your changes

To test changes, open the `vscode-objectscript` folder in VSCode.
Then, open the debug panel by clicking the `Run and Debug` icon on the sidebar, select the `Launch Extension` or `Launch Extension Alone`
option from the top menu, and click start. A new window will launch with the title
`[Extension Development Host]`.

### Pull requests

We do expect CI to be passing for a pull request before we will consider merging it. CI executed by Pull requests will produce `vsix` file, which can be downloaded and installed manually to test proposed functionality.

## Beta versions

Any change to `master` branch will call CI, which will produce [beta release](https://github.com/intersystems-community/vscode-objectscript/releases), which can be manually installed.

## Local Build

Steps to build the extension on your machine once you've cloned the repo:

```bash
> npm install -g vsce
# Perform the next steps in the vscode-objectscript folder.
> npm install
> npm run package
```

Resulting in a `vscode-objectscript-$VERSION.vsix` file in your `vscode-objectscript` folder.
