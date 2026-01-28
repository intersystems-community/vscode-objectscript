# Contributing to the ObjectScript extension for Visual Studio Code

## Before you start

The extensions in the [official extension pack](https://docs.intersystems.com/components/csp/docbook/DocBook.UI.Page.cls?KEY=GVSCO_install) are maintained by the Developer Tools team within InterSystems. We welcome community contributions, but at times may have limited bandwidth for thorough reviews alongside our other work. Before starting work on your pull request, please be aware of the following guidelines:

1. Make sure at least one GitHub issue exists that your pull request will "fix". If no issue exists yet, please create it before starting your work.
1. If an issue already exists but is assigned to someone else, please message them before starting your work. The other user may have work in progress.
1. Feature requests require a detailed spec laid out in the issue before a linked pull request will be reviewed. The spec should be approved by at least one maintainer before starting work on it. This is needed to ensure that the feature is in line with the broader roadmap for the extensions and to avoid contributors wasting their time on something that will not be accepted.

## Contributing a pull request

### Prerequisites

1. [Node.js](https://nodejs.org/) 22
1. Windows, macOS, or Linux
1. [Visual Studio Code](https://code.visualstudio.com/)

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

Snippets syntax is described [here](https://code.visualstudio.com/docs/editor/userdefinedsnippets). 

### Run dev build and validate your changes

To test changes, open the `vscode-objectscript` folder in VSCode.
Then, open the debug panel by clicking the `Run and Debug` icon on the Activity Bar, select the `Launch Extension`
option from the top menu, and click start. A new window will launch with the title
`[Extension Development Host]`. Do your testing here.

### Pull requests

Work should be done on a unique branch -- not the master branch. Pull requests require the approval of two PMC members, as described in the [Governance document](GOVERNANCE.md). PMC review is often high level, so in addition to that, you should request a review by someone familiar with the technical details of your particular pull request.

Please run the command `npm run lint-fix` before committing your changes. This will apply consistent styling and ensure that your pull request passes our code quality CI workflow.

We expect CI to be passing for a pull request before we will consider merging it. CI executed by pull requests will produce a `vsix` file, which can be downloaded and installed manually to test proposed functionality.

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
