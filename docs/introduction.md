---
layout: default
title: Introduction
permalink: /introduction/
nav_order: 1
---

> **Note:** This documentation has been moved to the [InterSystems Documentation site](https://docs.intersystems.com/components/csp/docbook/DocBook.UI.Page.cls?KEY=GVSCO_intro). This page will be removed at a later date.

# Introduction

Visual Studio Code (VS Code) is a free source code editor made by Microsoft for Windows, Linux and macOS. It provides built-in support for JavaScript, TypeScript and Node.js. You can add extensions to provide support for numerous other languages such as C++, C#, Java, Python, PHP, and Go, and runtimes such as .NET and Unity.

The InterSystems extensions enable you to use VS Code to connect to an InterSystems IRIS server and develop code in ObjectScript. This document covers issues specific to those extensions and working with ObjectScript and an InterSystems IRIS server. The [Visual Studio Code Documentation](https://code.visualstudio.com/docs) is an excellent resource on VS Code, so it is a good idea to be familiar with it in addition this document.

Development in ObjectScript involves both your local client machine, and an InterSystems IRIS server. Because both resources are required, workflow is different from that typical for many languages. Source code files are edited on the client, and saved to the local disk where they can be managed with a Version Control System. In addition, source files are exported to an InterSystems IRIS server, where they can be compiled, run, and debugged.

For existing customers, the InterSystems ObjectScript extension supports Studio extensions, as provided by `%Studio.Extension.Base`. If you rely on Studio extensions such as source control hooks, you can continue to use them in VS Code. VS Code is supported by InterSystems Cache and Ensemble 2016.2 and higher, and all versions of InterSystems IRIS.
