---
layout: default
title: Export settings
permalink: /export-settings/
nav_order: 4
---
# Export settings

There are a few settings that control how the code is exported to the local machine from the server. `VSCode-ObjectScript` expects that these settings follow the folders' structure taken for your project.

- `objectscript.export.folder` -- Root for ObjectScript sources in the project. Default value is `src`. The empty value is accepted and considered as a root of the project.

- `objectscript.export.addCategory` -- If `true` adds folders for particular file types under the folder defined in the `objectscript.export.folder` setting. Files of type `cls`, `int`, `mac` and `inc` are placed in a folder with same type. Any other file types are placed in the `oth` folder.
You can define the structure as an object, where the property name is supplied as pattern (mask or RegExp) and the value as a folder. For example:

```json
{
 "%*.cls": "_cls",
 "*.cls": "cls"
}
```

     This saves percent classes to the `_cls` folder, and any other classes to the `cls` folder.

- `objectscript.export.atelier` -- Store classes and routines in format same as in Atelier, with packages as subfolders.

- `objectscript.export.generated` -- Specifies that generated source code files should be exported.

- `objectscript.export.filter` -- SQL filter that can be used to match the names.

- `objectscript.export.category` -- Specifies a category to export: CLS = classes; RTN = routines; CSP = csp files; OTH = other. Default is `*` to export all categories. Used by command `Export all`.

- `objectscript.export.noStorage` - Strip the storage xml on export.  (Useful for multiple systems).

- `objectscript.export.dontExportIfNoChanges` - Don't update the local file on export if the content is identical to the server code.

Export settings are also used to determine how to translate the class name to the file name and back. So, it's important to have correct settings, not just for export.