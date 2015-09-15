var webpack 				= require('webpack');
var ClosureCompilerPlugin 	= require('../');
var ExtractTextPlugin 		= require('extract-text-webpack-plugin');

module.exports = {
	entry: {
		script: './script',
		script2: './script2',
		script3: './script3',
		script4: './script4'
	},
	output: {
		filename: '[name].min.js',
		path: __dirname + '/assets'
	},
	module: {
		loaders: [
			{
				test: /\.less$/,
				loader: ExtractTextPlugin.extract('style', 'css?minimize&sourceMap!autoprefixer!less?sourceMap')
			}
		]
	},
	devtool: 'source-map',
	plugins: [
		new ExtractTextPlugin('style.min.css'),
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