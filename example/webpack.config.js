var webpack = require('webpack');
var ClosureCompilerPlugin = require('../');
var ExtractTextPlugin = require('extract-text-webpack-plugin');

var optimizerPlugin = new webpack.optimize.UglifyJsPlugin({
	compress: {
		warnings: false
	}
});

if (process.env.CCWP_ENV === 'cc') {
	optimizerPlugin = new ClosureCompilerPlugin({
		// compilation_level: 'WHITESPACE_ONLY',
		// create_source_map: false,
		// json_streams: 'BOTH'
	});
}

module.exports = {
	entry: {
		script: './script',
		script2: './script2',
		script3: './script3',
		script4: './script4',
		script5: './script5'
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
		optimizerPlugin
	]
};