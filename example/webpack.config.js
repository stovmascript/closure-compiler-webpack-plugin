var webpack 				= require('webpack');
var ClosureCompilerPlugin 	= require('../index');

module.exports = {
	entry: {
		script: './script',
		script2: './script2',
		script3: './script3',
		script4: './script4'
	},
	output: {
		filename: '[name].min.js'
	},
	devtool: 'source-map',
	plugins: [
		new ClosureCompilerPlugin({
			// compilation_level: 'ADVANCED_OPTIMIZATIONS',
			// create_source_map: false
		}),
		// new webpack.optimize.UglifyJsPlugin({
		// 	compress: {
		// 		warnings: false
		// 	}
		// })
	]
};