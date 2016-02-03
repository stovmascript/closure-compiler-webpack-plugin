var nailgun = require('node-nailgun');
var gcc = require('google-closure-compiler').compiler.COMPILER_PATH;

var ModuleFilenameHelpers = require('webpack/lib/ModuleFilenameHelpers');
var SourceMapConsumer = require('webpack-core/lib/source-map').SourceMapConsumer;
var SourceMapSource = require('webpack-core/lib/SourceMapSource');
var RawSource = require('webpack-core/lib/RawSource');
var RequestShortener = require('webpack/lib/RequestShortener');

function ClosureCompilerPlugin(options) {
	if (typeof options !== 'object') {
		options = {};
	} else if (options.create_source_map !== false) {
		options['json_streams'] = 'OUT';
	} else {
		delete options.json_streams;
	}

	this.options = options;
}

ClosureCompilerPlugin.prototype.apply = function(compiler) {
	var options = this.options;
	var jvm = nailgun.createServer();
	var jvmStarted = false;

	options.test = options.test || /\.js($|\?)/i;

	compiler.plugin('compilation', function(compilation) {
		if (options.sourceMap !== false) {
			compilation.plugin('build-module', function(module) {
				module.useSourceMap = true;
			});
		}

		compilation.plugin('optimize-chunk-assets', function(chunks, callback) {
			var compilationPromise = new Promise(function(resolve) {
				var files = [];
				var processedFiles = [];

				chunks.forEach(function(chunk) {
					chunk.files.forEach(function(file) {
						files.push(file);
					});
				});

				compilation.additionalChunkAssets.forEach(function(file) {
					files.push(file);
				});

				files = files.filter(ModuleFilenameHelpers.matchObject.bind(undefined, options));

				var numberOfFilesToProcess = files.length;

				if (files.length) {
					new Promise(function(resolve, reject) {
						if (jvmStarted) {
							resolve();
						} else {
							jvm.spawnJar(gcc, ['--help'], function(err) {
								if (err) {
									reject(err);
								} else {
									jvmStarted = true;
									resolve();
								}
							});
						}
					})
					.then(function() {
						files.forEach(function(file) {
							try {
								var asset = compilation.assets[file];

								if (asset.__ClosureCompilerPlugin) {
									compilation.assets[file] = asset.__ClosureCompilerPlugin;
									numberOfFilesToProcess--;

									if (numberOfFilesToProcess > 0) {
										return;
									}
								}

								var gccArgs = JSON.parse(JSON.stringify(options));
								var gccProcessArgs = [];

								if (options.create_source_map !== false) {
									if (asset.sourceAndMap) {
										var sourceAndMap = asset.sourceAndMap();
										var inputSourceMap = sourceAndMap.map;
										var input = sourceAndMap.source;
									} else {
										var inputSourceMap = asset.map();
										var input = asset.source();
									}

									var sourceMap = new SourceMapConsumer(inputSourceMap);
								} else {
									var input = asset.source();

									delete gccArgs.create_source_map;
								}

								delete gccArgs.test;

								for (var key in gccArgs) {
									gccProcessArgs.push('--' + key);
									gccProcessArgs.push(gccArgs[key]);
								}

								jvm.spawnJar(gcc, gccProcessArgs, function(err, closureCompilerProcess) {
									if (err) {
										compilation.errors.push(new Error(file + ' from Nailgun JVM\n' + err));
										resolve();
									} else {
										var ender;
										var enderTick = false;
										var outputChunks = '';
										var output;
										var map;

										closureCompilerProcess.stdout.on('data', function(data) {
											outputChunks += data;
											enderTick = false;

											if (!ender) {
												ender = setInterval(function() {
													if (enderTick) {
														clearInterval(ender);

														try {
															var parsedJSON = JSON.parse(outputChunks);
														} catch(err) {}

														if (parsedJSON) {
															output = parsedJSON[0].src;
															map = JSON.parse(parsedJSON[0].source_map);
														} else {
															output = outputChunks;
														}

														if (map) {
															map.sources = [];
															map.sources.push(file);

															asset.__ClosureCompilerPlugin
															= compilation.assets[file]
															= new SourceMapSource(output, file, map, input, inputSourceMap);
														} else {
															asset.__ClosureCompilerPlugin
															= compilation.assets[file]
															= new RawSource(output);
														}

														if (processedFiles.length == (numberOfFilesToProcess - 1)
															|| numberOfFilesToProcess == 0) {
															resolve();
														} else {
															processedFiles.push(1);
														}
													}

													enderTick = true;
												});
											}
										});

										var warnings;

										closureCompilerProcess.stderr
										.on('data', function(data) {
											warnings += data.toString();
										})
										.on('end', function() {
											if (warnings) {
												compilation.warnings.push(new Error(
													file + ' from Closure Compiler\n' + warnings
												));

												resolve();
											}
										});

										closureCompilerProcess.stdin.write(input);
										closureCompilerProcess.stdin.end();
									}
								});
							} catch(err) {
								if (err.line) {
									if (sourceMap) {
										var original = sourceMap.originalPositionFor({
											line: err.line,
											column: err.col
										});
									}

									if (original && original.source) {
										compilation.errors.push(new Error(
											file
											+ ' from Closure Compiler\n'
											+ err.message
											+ ' ['
											+ new RequestShortener(compiler.context).shorten(original.source)
											+ ':'
											+ original.line
											+ ','
											+ original.column
											+ ']'
										));
									} else {
										compilation.errors.push(new Error(
											file
											+ ' from Closure Compiler\n'
											+ err.message
											+ ' ['
											+ file
											+ ':'
											+ err.line
											+ ','
											+ err.col
											+ ']'
										));
									}
								} else if (err.msg) {
									compilation.errors.push(new Error(file + ' from Closure Compiler\n' + err.msg));
								} else {
									compilation.errors.push(new Error(file + ' from Closure Compiler\n' + err.stack));
								}

								resolve();
							}
						});
					})
					.catch(function(reason) {
						compilation.errors.push(new Error('Failed to jump start Nailgun JVM\n' + reason));
						resolve();
					});
				} else {
					resolve();
				}
			});

			compilationPromise.then(function() {
				callback();
			});
		});

		compilation.plugin('normal-module-loader', function(context) {
			context.minimize = true;
		});
	});
};

module.exports = ClosureCompilerPlugin;