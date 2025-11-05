# Contributing to the ObjectScript extension for Visual Studio Code

## Contributing a pull request

### Prerequisites

1. [Node.js](https://nodejs.org/) 18.x
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

TypeScript errors and warnings will be displayed in the `PROBLEMS` panel of Visual Studio Code.

### Editing code snippets

Code snippets are defined in files in the /snippets/ folder:

* objectscript-class.json - snippets for class definition context
* objectscript.json - snippets for objectscript context 
* objectscript.json - snippets for consistem objectscript context 

Snippets syntax is described [here](https://code.visualstudio.com/docs/editor/userdefinedsnippets). 

### Run dev build and validate your changes

To test changes, open the `vscode-objectscript` folder in VSCode.
Then, open the debug panel by clicking the `Run and Debug` icon on the Activity Bar, select the `Launch Extension`
option from the top menu, and click start. A new window will launch with the title
`[Extension Development Host]`. Do your testing here.

If you want to disable all other extensions when testing in the Extension Development Host, choose the `Launch Extension Alone` option instead.

### Pull requests

Work should be done on a unique branch -- not the master branch. Pull requests require the approval of two PMC members, as described in the [Governance document](GOVERNANCE.md). PMC review is often high level, so in addition to that, you should request a review by someone familiar with the technical details of your particular pull request. 

We do expect CI to be passing for a pull request before we will consider merging it. CI executed by pull requests will produce a `vsix` file, which can be downloaded and installed manually to test proposed functionality.

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
