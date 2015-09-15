var net 					= require('net');
var path 					= require('path');
var os 						= require('os');
var fs 						= require('fs');

var nailgun 				= require('node-nailgun');
var RSVP 					= require('rsvp');
var temp 					= require('temp').track();
var gcc 					= require.resolve('google-closure-compiler/compiler.jar');
var es 						= require('event-stream');

if (process.platform != 'win32') {
	var mkfifoSync 			= require('mkfifo').mkfifoSync;
}

var ModuleFilenameHelpers 	= require('webpack/lib/ModuleFilenameHelpers');
var SourceMapConsumer 		= require('webpack-core/lib/source-map').SourceMapConsumer;
var SourceMapSource 		= require('webpack-core/lib/SourceMapSource');
var RawSource 				= require('webpack-core/lib/RawSource');
var RequestShortener 		= require('webpack/lib/RequestShortener');

function ClosureCompilerPlugin(options) {
	if (typeof options !== 'object') {
		options = {};
	}

	this.options = options;
}

ClosureCompilerPlugin.prototype.apply = function(compiler) {
	var options = this.options;
	var jvm = nailgun.createServer();

	if (options.create_source_map !== false) {
		var sourceMapOutputServer = net.createServer();
	}

	options.test = options.test || /\.js($|\?)/i;

	compiler.plugin('compilation', function(compilation) {
		if (options.sourceMap !== false) {
			compilation.plugin('build-module', function(module) {
				module.useSourceMap = true;
			});
		}

		compilation.plugin('optimize-chunk-assets', function(chunks, callback) {
			var compilationPromise = new RSVP.Promise(function(resolve, reject) {
				var files 			= [];
				var processedFiles 	= [];

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

								if (process.platform == 'win32') {
									var sourceMapOutputDump = temp.openSync('ccwp-dump-', 'w+').path;
								} else {
									var sourceMapOutputDump = temp.path({prefix: 'ccwp-dump-'});

									mkfifoSync(sourceMapOutputDump, 0600);
								}

								gccArgs.create_source_map = sourceMapOutputDump;
							} else {
								var input = asset.source();

								delete gccArgs.create_source_map;
							}

							delete gccArgs.test;

							for (var key in gccArgs) {
								gccProcessArgs.push('--' + key);
								gccProcessArgs.push(gccArgs[key]);
							}

							jvm.spawnJar(gcc, gccProcessArgs, function(err, proc) {
								if (err) {
									compilation.errors.push(new Error(file + ' from Nailgun JVM\n' + err));
									resolve();
								} else {
									var closureCompilerProcess = proc;
									var jsOutputStream = es.through();
									var finalStream = es.through();
									var ender;
									var enderTick = false;
									var outputChunks = '';

									closureCompilerProcess.stdout.on('data', function(data) {
										outputChunks += data;
										enderTick = false;

										if (!ender) {
											ender = setInterval(function() {
												if (enderTick) {
													clearInterval(ender);
													jsOutputStream.write(outputChunks);
													jsOutputStream.end();
												}

												enderTick = true;
											});
										}
									});

									if (options.create_source_map !== false) {
										var sourceMapOutputStream = es.through();
										var sourceMapChunks = '';

										sourceMapOutputServer.listen(function() {
											if (process.platform == 'win32') {
												var ender;
												var enderTick = false;

												fs.watchFile(sourceMapOutputDump, {interval: 100}, function(curr, prev) {
													enderTick = false;

													if (!ender) {
														ender = setInterval(function() {
															if (enderTick) {
																clearInterval(ender);

																var dumpStream = fs.createReadStream(sourceMapOutputDump);

																dumpStream
																.on('data', function(data) {
																	sourceMapChunks += data;
																})
																.on('end', function() {
																	fs.unwatchFile(sourceMapOutputDump);
																	sourceMapOutputServer.close();
																	sourceMapOutputStream.write(sourceMapChunks);
																	sourceMapOutputStream.end();
																});
															}

															enderTick = true;
														}, 100);
													}
												});
											} else {
												var dumpStream = fs.createReadStream(sourceMapOutputDump);

												dumpStream
												.on('data', function(data) {
													sourceMapChunks += data;
												})
												.on('end', function() {
													fs.unlink(sourceMapOutputDump, function() {
														sourceMapOutputServer.close();
														sourceMapOutputStream.write(sourceMapChunks);
														sourceMapOutputStream.end();
													});
												});
											}
										});

										es
										.merge(jsOutputStream, sourceMapOutputStream)
										.pipe(finalStream);
									} else {
										jsOutputStream.pipe(finalStream);
									}

									var output;
									var map;

									finalStream
									.on('data', function(data) {
										data = data.toString();

										try {
											var parsedJSON = JSON.parse(data);
										} catch(err) {}

										if (parsedJSON) {
											map = parsedJSON;
										} else {
											output = data;
										}
									})
									.on('end', function() {
										if (map) {
											map.sources = [];
											map.sources.push(file);

											asset.__ClosureCompilerPlugin = compilation.assets[file] = new SourceMapSource(
												output, file, map, input, inputSourceMap
											);
										} else {
											asset.__ClosureCompilerPlugin = compilation.assets[file] = new RawSource(output);
										}

										if (processedFiles.length == (numberOfFilesToProcess - 1) ||
											numberOfFilesToProcess == 0) {
											resolve();
										} else {
											processedFiles.push(1);
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
										file +
										' from Closure Compiler\n' +
										err.message +
										' [' +
										new RequestShortener(compiler.context).shorten(original.source) +
										':' +
										original.line +
										',' +
										original.column +
										']'
									));
								} else {
									compilation.errors.push(new Error(
										file +
										' from Closure Compiler\n' +
										err.message +
										' [' +
										file +
										':' +
										err.line +
										',' +
										err.col +
										']'
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
				} else {
					resolve();
				}
			});

			compilationPromise.then(function(result) {
				temp.cleanupSync();
				callback();
			});
		});

		compilation.plugin('normal-module-loader', function(context) {
			context.minimize = true;
		});
	});
};

module.exports = ClosureCompilerPlugin;