function OntologyLoader(dmoPath, $scope, $interval) {
	
	var mobileRdfUri = "rdf/mobile.n3";
	var multitrackRdfUri = "http://purl.org/ontology/studio/multitrack";
	var rdfsUri = "http://www.w3.org/2000/01/rdf-schema";
	
	var dmos = {}; //dmos at all hierarchy levels for quick access during mapping assignment
	var features = {};
	
	this.loadDmo = function(rdfUri) {
		$http.get(dmoPath+rdfUri).success(function(data) {
			rdfstore.create(function(err, store) {
				store.load('text/turtle', data, function(err, results) {
					if (err) {
						console.log(err);
					}
					store.execute("SELECT ?rendering ?label \
					WHERE { ?rendering a <"+mobileRdfUri+"#Rendering> . \
					?rendering <"+rdfsUri+"#label> ?label }", function(err, results) {
						for (var i = 0; i < results.length; i++) {
							//TODO MAKE LIST WITH SEVERAL SELECTABLE RENDERINGS!!
							loadRendering(store, results[i].rendering.value, results[i].label.value);
						}
					});
				});
			});
		});
	}
	
	function loadRendering(store, renderingUri, label) {
		store.execute("SELECT ?dmo \
		WHERE { <"+renderingUri+"> <"+mobileRdfUri+"#hasDMO> ?dmo }", function(err, results) {
			$scope.rendering = new Rendering(label, $scope);
			$scope.scheduler = new Scheduler($scope);
			for (var i = 0; i < results.length; i++) {
				loadDMO(store, results[i].dmo.value);
			}
			loadMappings(store, renderingUri);
		});
	}
	
	function loadDMO(store, dmoUri, parentDMO) {
		var dmo = new DynamicMusicObject(dmoUri, $scope.scheduler);
		dmos[dmoUri] = dmo;
		if (parentDMO) {
			parentDMO.addChild(dmo);
		} else {
			$scope.rendering.dmo = dmo; //pass top-level dmo to rendering
		}
		loadAudioPath(store, dmoUri, dmo);
		loadParameters(store, dmoUri, dmo);
		loadChildren(store, dmoUri, dmo);
	}
	
	function loadAudioPath(store, dmoUri, dmo) {
		store.execute("SELECT ?audioPath \
		WHERE { <"+dmoUri+"> <"+mobileRdfUri+"#hasAudioPath> ?audioPath }", function(err, results) {
			for (var i = 0; i < results.length; i++) {
				var audioPath = dmoPath+"/"+results[i].audioPath.value;
				dmo.setSourcePath(audioPath);
				$scope.scheduler.addSourceFile(audioPath);
			}
		});
	}
	
	function loadParameters(store, dmoUri, dmo) {
		store.execute("SELECT ?parameter ?parameterType ?value ?featuresPath ?subsetCondition ?graphPath ?label \
		WHERE { <"+dmoUri+"> <"+mobileRdfUri+"#hasParameter> ?parameter . \
		OPTIONAL { ?parameter a ?parameterType . \
			?parameter <"+mobileRdfUri+"#hasValue> ?value . } \
		OPTIONAL { ?parameter <"+mobileRdfUri+"#hasFeaturesPath> ?featuresPath . } \
		OPTIONAL { ?parameter <"+mobileRdfUri+"#isSubset> ?subsetCondition . } \
		OPTIONAL { ?parameter <"+mobileRdfUri+"#hasGraphPath> ?graphPath . } \
		OPTIONAL { ?parameter <"+rdfsUri+"#label> ?label . } }", function(err, results) {
			for (var i = 0; i < results.length; i++) {
				var label = getValue(results[i].label);
				var value = getNumberValue(results[i].value);
				if (value) {
					var parameter = getParameter(dmo, results[i].parameter.value, results[i].parameterType.value);
					parameter.update(undefined, value);
				}
				if (results[i].featuresPath) {
					var featuresPath = dmoPath+"/"+results[i].featuresPath.value;
					var subsetCondition = getValue(results[i].subsetCondition);
					loadFeatures(dmo, results[i].parameter.value, featuresPath, subsetCondition, label);
				}
				if (results[i].graphPath) {
					var graphPath = dmoPath+"/"+results[i].graphPath.value;
					loadGraph(dmo, results[i].parameter.value, graphPath, label);
				}
			}
			if (results.length <= 0) {
				$scope.ontologiesLoaded = true;
			}
		});
	}
	
	function loadChildren(store, dmoUri, dmo) {
		store.execute("SELECT ?child \
		WHERE { <"+dmoUri+"> <"+mobileRdfUri+"#hasChild> ?child }", function(err, results) {
			for (var i = 0; i < results.length; i++) {
				loadDMO(store, results[i].child.value, dmo);
			}
		});
	}
	
	function loadMappings(store, renderingUri) {
		store.execute("SELECT ?mapping WHERE { <"+renderingUri+"> <"+mobileRdfUri+"#hasMapping> ?mapping }", function(err, results) {
			for (var i = 0; i < results.length; i++) {
				loadMapping(store, results[i].mapping.value);
			}
		});
	}
	
	function loadMapping(store, mappingUri) {
		$scope.mappingLoadingThreads++;
		store.execute("SELECT ?mappingType ?owner ?parameter ?parameterType \
		WHERE { <"+mappingUri+"> a ?mappingType . \
			<"+mappingUri+"> <"+mobileRdfUri+"#toParameter> ?parameter . \
		OPTIONAL { <"+mappingUri+"> <"+mobileRdfUri+"#toOwner> ?owner . } \
		OPTIONAL { ?parameter a ?parameterType . } }", function(err, results) {
			for (var i = 0; i < results.length; i++) {
				if (results[i].owner) {
					var owner = dmos[results[i].owner.value];
					if (!owner) {
						owner = getGraphControl(undefined, results[i].owner.value);
						if (!owner) {
							owner = getStatsControl(undefined, results[i].owner.value);
						}
					}
				}
				if (results[i].parameterType) {
					var parameterType = results[i].parameterType.value;
				}
				var mappingType = Constants.PRODUCT_MAPPING;
				if (results[i].mappingType.value == mobileRdfUri+"#SumMapping") {
					mappingType = Constants.SUM_MAPPING;
				}
				var parameter = getParameter(owner, results[i].parameter.value, parameterType);
				loadMappingDimensions(store, mappingUri, mappingType, parameter);
			}
		});
	}
	
	function loadMappingDimensions(store, mappingUri, mappingType, parameter) {
		store.execute("SELECT ?control ?controlType ?label ?controlDMO ?function ?functionType ?position ?range ?multiplier ?addend ?modulus \
		WHERE { <"+mappingUri+"> <"+mobileRdfUri+"#hasDimension> ?dimension . \
			?dimension <"+mobileRdfUri+"#fromControl> ?control . \
		OPTIONAL { ?dimension <"+mobileRdfUri+"#withFunction> ?function . \
			?function a ?functionType . } \
		OPTIONAL { ?control a ?controlType . } \
		OPTIONAL { ?control <"+rdfsUri+"#label> ?label . } \
		OPTIONAL { ?control <"+mobileRdfUri+"#fromDMO> ?controlDMO . } \
		OPTIONAL { ?dimension <"+mobileRdfUri+"#hasMultiplier> ?multiplier . } \
		OPTIONAL { ?dimension <"+mobileRdfUri+"#hasAddend> ?addend . } \
		OPTIONAL { ?dimension <"+mobileRdfUri+"#hasModulus> ?modulus . } \
		OPTIONAL { ?function <"+mobileRdfUri+"#atPosition> ?position . } \
		OPTIONAL { ?function <"+mobileRdfUri+"#hasRange> ?range . } }", function(err, results) {
			var controls = [];
			var functions = [];
			var multipliers = [];
			var addends = [];
			var moduli = [];
			for (var i = 0; i < results.length; i++) {
				controls[i] = getControlFromResults(results[i].control, results[i].controlType, results[i].label, results[i].controlDMO);
				var position = getNumberValue(results[i].position);
				var range = getNumberValue(results[i].range);
				functions[i] = getFunction(results[i].functionType, position, range);
				multipliers[i] = getNumberValue(results[i].multiplier, 1);
				addends[i] = getNumberValue(results[i].addend, 0);
				moduli[i] = getNumberValue(results[i].modulus);
			}
			$scope.mappings[mappingUri] = new Mapping(mappingType, controls, functions, multipliers, addends, moduli, parameter);
			$scope.mappingLoadingThreads--;
			$scope.$apply();
		});
	}
	
	function getFunction(functionTypeResult, position, range) {
		if (functionTypeResult) {
			functionType = functionTypeResult.value;
			if (functionType == mobileRdfUri+"#TriangleFunction") {
				return new TriangleFunction(position, range);
			} else if (functionType == mobileRdfUri+"#RectangleFunction") {
				return new RectangleFunction(position, range);
			}
		}
		return new LinearFunction();
	}
	
	function getControlFromResults(controlResult, controlTypeResult, labelResult, dmoResult) {
		if (labelResult) {
			var label = labelResult.value;
		}
		if (controlResult) {
			var control = controlResult.value;
		}
		if (controlTypeResult) {
			var controlType = controlTypeResult.value;
		}
		if (dmoResult) {
			var dmo = dmos[dmoResult.value];
		}
		return getControl(control, controlType, label, dmo);
	}
	
	function getValue(result) {
		if (result) {
			return result.value;
		}
	}
	
	function getNumberValue(result, defaultValue) {
		if (result) {
			return Number(result.value);
		}
		return defaultValue;
	}
	
	function getControl(controlUri, controlTypeUri, label, dmo) {
		if (controlUri == mobileRdfUri+"#AccelerometerX") {
			return getAccelerometerControl(0);
		} else if (controlUri == mobileRdfUri+"#AccelerometerY") {
			return getAccelerometerControl(1);
		}	else if (controlUri == mobileRdfUri+"#AccelerometerZ") {
			return getAccelerometerControl(2);
		} else if (controlUri == mobileRdfUri+"#TiltX") {
			return getAccelerometerControl(3);
		} else if (controlUri == mobileRdfUri+"#TiltY") {
			return getAccelerometerControl(4);
		} else if (controlUri == mobileRdfUri+"#GeolocationLatitude") {
			return getGeolocationControl(0);
		}	else if (controlUri == mobileRdfUri+"#GeolocationLongitude") {
			return getGeolocationControl(1);
		}	else if (controlUri == mobileRdfUri+"#GeolocationDistance") {
			return getGeolocationControl(2);
		}	else if (controlUri == mobileRdfUri+"#CompassHeading") {
			return getCompassControl(0);
		}	else if (controlTypeUri == mobileRdfUri+"#Slider") {
			return getUIControl(0, controlUri, label);
		} else if (controlTypeUri == mobileRdfUri+"#Toggle") {
			return getUIControl(1, controlUri, label);
		} else if (controlUri == mobileRdfUri+"#Random" || controlTypeUri == mobileRdfUri+"#Random") {
			return getStatsControl(0, controlUri);
		} else if (controlTypeUri == mobileRdfUri+"#GraphControl") {
			if (dmo) {
				graph = dmo.getGraph();
			}
			return getGraphControl(0, controlUri, graph);
		}
	}
	
	function getAccelerometerControl(index) {
		if (!$scope.accelerometerWatcher) {
			$scope.accelerometerWatcher = new AccelerometerWatcher($scope);
		}
		if (index == 0) {
			return $scope.accelerometerWatcher.xControl;
		} else if (index == 1) {
			return $scope.accelerometerWatcher.yControl;
		} else if (index == 2){
			return $scope.accelerometerWatcher.zControl;
		} else if (index == 3){
			return $scope.accelerometerWatcher.tiltXControl;
		} else if (index == 4){
			return $scope.accelerometerWatcher.tiltYControl;
		}
	}
	
	function getGeolocationControl(index) {
		if (!$scope.geolocationWatcher) {
			$scope.geolocationWatcher = new GeolocationWatcher($scope);
		}
		if (index == 0) {
			return $scope.geolocationWatcher.latitudeControl;
		} else if (index == 1) {
			return $scope.geolocationWatcher.longitudeControl;
		} else {
			return $scope.geolocationWatcher.distanceControl;
		}
	}
	
	function getCompassControl(index) {
		if (!$scope.compassWatcher) {
			$scope.compassWatcher = new CompassWatcher($scope);
		}
		if (index == 0) {
			return $scope.compassWatcher.headingControl;
		} else {
			return $scope.compassWatcher.accuracyControl;
		}
	}
	
	function getStatsControl(index, uri) {
		if (!$scope.statsControls[uri]) {
			$scope.statsControls[uri] = new StatsControls($interval);
		}
		if (index == 0) {
			return $scope.statsControls[uri].randomControl;
		} else {
			return $scope.statsControls[uri];
		}
	}
	
	function getGraphControl(index, uri, graph) {
		if (!$scope.graphControls[uri]) {
			$scope.graphControls[uri] = new GraphControls(graph);
		} else {
			$scope.graphControls[uri].setGraph(graph);
		}
		if (index == 0) {
			return $scope.graphControls[uri].nextNodeControl;
		} else {
			return $scope.graphControls[uri];
		}
	}
	
	function getUIControl(type, uri, label) {
		if (!$scope.uiControls[uri]) {
			$scope.uiControls[uri] = new Control(0, label, type, $scope);
			$scope.$apply();
		}
		return $scope.uiControls[uri];
	}
	
	function getParameter(owner, parameterUri, parameterTypeUri ) {
		if (parameterUri == mobileRdfUri+"#Amplitude" || parameterTypeUri == mobileRdfUri+"#Amplitude") {
			return owner.amplitude;
		} if (parameterUri == mobileRdfUri+"#PlaybackRate" || parameterTypeUri == mobileRdfUri+"#PlaybackRate") {
			return owner.playbackRate;
		} else if (parameterUri == mobileRdfUri+"#Pan" || parameterTypeUri == mobileRdfUri+"#Pan") {
			return owner.pan;
		}	else if (parameterUri == mobileRdfUri+"#Distance" || parameterTypeUri == mobileRdfUri+"#Distance") {
			return owner.distance;
		} else if (parameterUri == mobileRdfUri+"#Reverb" || parameterTypeUri == mobileRdfUri+"#Reverb") {
			return owner.reverb;
		} else if (parameterTypeUri == mobileRdfUri+"#Segmentation") {
			return owner.segmentIndex;
		} else if (parameterUri == mobileRdfUri+"#SegmentCount" || parameterTypeUri == mobileRdfUri+"#SegmentCount") {
			return owner.segmentCount;
		} else if (parameterUri == mobileRdfUri+"#SegmentDurationRatio" || parameterTypeUri == mobileRdfUri+"#SegmentDurationRatio") {
			return owner.segmentDurationRatio;
		} else if (parameterUri == mobileRdfUri+"#SegmentProportion" || parameterTypeUri == mobileRdfUri+"#SegmentProportion") {
			return owner.segmentProportion;
		} else if (parameterUri == mobileRdfUri+"#ListenerOrientation" || parameterTypeUri == mobileRdfUri+"#ListenerOrientation") {
			return $scope.rendering.listenerOrientation;
		} else if (parameterUri == mobileRdfUri+"#StatsFrequency" || parameterTypeUri == mobileRdfUri+"#StatsFrequency") {
			return owner.frequency;
		} else if (parameterUri == mobileRdfUri+"#LeapingProbability" || parameterTypeUri == mobileRdfUri+"#LeapingProbability") {
			return owner.leapingProbability;
		} else if (parameterUri == mobileRdfUri+"#ContinueAfterLeaping" || parameterTypeUri == mobileRdfUri+"#ContinueAfterLeaping") {
			return owner.continueAfterLeaping;
		}
	}
	
	var eventOntology = "http://purl.org/NET/c4dm/event.owl";
	var timelineOntology = "http://purl.org/NET/c4dm/timeline.owl";
	
	function loadFeatures(dmo, parameterUri, uri, subsetCondition) {
		var fileExtension = uri.slice(uri.indexOf('.')+1);
		if (fileExtension == 'n3') {
			loadFeaturesFromRdf(dmo, parameterUri, uri, subsetCondition);
		} else if (fileExtension == 'json') {
			loadFeaturesFromJson(dmo, parameterUri, uri, subsetCondition);
		}
	}
		
	function loadFeaturesFromRdf(dmo, parameterUri, rdfUri, subsetCondition) {
		if (features[rdfUri]) {
			setSegmentationFromRdf(dmo, rdfUri, subsetCondition)
		} else {
			//console.log("start");
			$scope.featureLoadingThreads++;
			$http.get(rdfUri).success(function(data) {
				//console.log("get");
				rdfstore.create(function(err, store) {
					//console.log("create");
					store.load('text/turtle', data, function(err, results) {
						//console.log("load");
						if (err) {
							console.log(err);
						}
						//for now looks at anything containing event times
						//?eventType <"+rdfsUri+"#subClassOf>* <"+eventOntology+"#Event> . \
						store.execute("SELECT ?xsdTime ?label \
						WHERE { ?event a ?eventType . \
						?event <"+eventOntology+"#time> ?time . \
						?time <"+timelineOntology+"#at> ?xsdTime . \
						OPTIONAL { ?event <"+rdfsUri+"#label> ?label . } }", function(err, results) {
							//console.log("execute");
							var times = [];
							for (var i = 0; i < results.length; i++) {
								//insert value/label pairs
								times.push({ time: toSecondsNumber(results[i].xsdTime.value), label: getValue(results[i].label) });
							}
							//save so that file does not have to be read twice
							features[rdfUri] = times.sort(function(a,b){return a.time - b.time});
							setSegmentationFromRdf(dmo, rdfUri, subsetCondition);
							$scope.featureLoadingThreads--;
							$scope.$apply();
						});
					});
				});
			});
		}
	}
	
	function setSegmentationFromRdf(dmo, rdfUri, subsetCondition) {
		subset = features[rdfUri];
		if (subsetCondition) {
			subset = features[rdfUri].filter(function(x) { return x.label == subsetCondition; });
		}
		subset = subset.map(function(x) { return x.time; });
		dmo.setSegmentation(subset);
	}
	
	function loadFeaturesFromJson(dmo, parameterUri, jsonUri, subsetCondition) {
		if (features[jsonUri]) {
			setSegmentationFromRdf(dmo, jsonUri, subsetCondition)
		} else {
			$scope.featureLoadingThreads++;
			$http.get(jsonUri).success(function(json) {
				if (json.beat) {
					json = json.beat[0].data;
					if (subsetCondition) {
						json = json.filter(function(x) { return x.label.value == subsetCondition; });
					}
					json = json.map(function(x) { return x.time.value; });
				}
				dmo.setSegmentation(json);
				
				$scope.featureLoadingThreads--;
				$scope.$apply();
			});
		}
	}
	
	function loadGraph(dmo, parameterUri, jsonUri) {
		$scope.featureLoadingThreads++;
		$http.get(jsonUri).success(function(json) {
			dmo.setGraph(json);
			$scope.featureLoadingThreads--;
			$scope.$apply();
		});
	}
	
	function toSecondsNumber(xsdDurationString) {
		return Number(xsdDurationString.substring(2, xsdDurationString.length-1));
	}
	
}