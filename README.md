# Closure Compiler plugin for webpack

## Prerequisites

- Java 7 or higher
- Build tools required by node-gyp for [your platform](https://github.com/nodejs/node-gyp#installation)

## Installation

```shell
npm install closure-compiler-webpack-plugin
```

## Example

```javascript
// webpack.config.js
var ClosureCompilerPlugin = require('closure-compiler-webpack-plugin');

module.exports = {
    entry: {
        core: './core',
        home: './home'
    },
    output: {
        filename: '[name].min.js'
    },
    devtool: 'source-map',
    plugins: [
        new ClosureCompilerPlugin()
    ]
};
```

## Options

Use Closure Compiler's flags.

```javascript
// webpack.config.js
...

    plugins: [
        new ClosureCompilerPlugin({
            compilation_level: 'ADVANCED',
            create_source_map: false
            // Use 'create_source_map: false' to override your webpack 
            // config. Otherwise, anything you set for this option will be 
            // ignored in favour of your 'devtool' and filename configuration.
        })
    ]

...
```

For a list of available options:

```shell
java -jar node_modules/closure-compiler-webpack-plugin/node_modules/google-closure-compiler/compiler.jar --help
```

## Shortcomings

Here are some notes, where this package could be improved. Feel free to submit PRs :)

- For some reason, the end event from the Closure Compiler stdout stream for the output JS isn't being triggered. From my investigation, it doesn't seem to be connected to the Nailgun wrapper, but rather a problem of Closure Compiler itself. A pretty ugly hack is used to work around this issue.
- Unlike the built-in UglifyJsPlugin, this one is heavily stream/event based, so there is some state tracking involved to signal when the last file in the compilation was processed. A promise is used, but it still doesn't seem very pretty.