function OntologyLoader(dmoUri, $scope) {
	
	var mobileRdfUri = "rdf/mobile.n3";
	var multitrackRdfUri = "http://purl.org/ontology/studio/multitrack";
	var rdfsUri = "http://www.w3.org/2000/01/rdf-schema";
	
	var accelerometerWatcher, geolocationWatcher;
	
	this.loadDmo = function(rdfUri) {
		$http.get(dmoUri+rdfUri).success(function(data) {
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
	
	var loadRendering = function(store, renderingUri, label) {
		store.execute("SELECT ?label ?path \
		WHERE { <"+renderingUri+"> <"+multitrackRdfUri+"#track> ?track . \
		?track <"+mobileRdfUri+"#hasPath> ?path }", function(err, results) {
			var trackPaths = [];
			for (var i = 0; i < results.length; i++) {
				trackPaths.push(dmoUri+"/"+results[i].path.value);
			}
			$scope.rendering = new Rendering(label, trackPaths, $scope);
			loadMappings(store, renderingUri);
		});
	}
	
	var loadMappings = function(store, renderingUri) {
		store.execute("SELECT ?mapping WHERE { <"+renderingUri+"> <"+mobileRdfUri+"#hasMapping> ?mapping }", function(err, results) {
			for (var i = 0; i < results.length; i++) {
				loadMapping(store, results[i].mapping.value);
			}
		});
	}
	
	var loadMapping = function(store, mappingUri) {
		store.execute("SELECT ?control ?trackPath ?parameter ?multiplier \
		WHERE { <"+mappingUri+"> <"+mobileRdfUri+"#fromControl> ?control . \
		<"+mappingUri+"> <"+mobileRdfUri+"#toTrack> ?track . \
		?track <"+mobileRdfUri+"#hasPath> ?trackPath . \
		<"+mappingUri+"> <"+mobileRdfUri+"#toParameter> ?parameter . \
		<"+mappingUri+"> <"+mobileRdfUri+"#hasMultiplier> ?multiplier}", function(err, results) {
			for (var i = 0; i < results.length; i++) {
				var control = getControl(results[i].control.value);
				var track = $scope.rendering.getTrackForPath(dmoUri+"/"+results[i].trackPath.value);
				var parameter = getParameter(track, results[i].parameter.value);
				var multiplier = results[i].multiplier.value;
				new Mapping(control, parameter, multiplier);
			}
		});
	}
	
	var getControl = function(controlUri) {
		if (controlUri == mobileRdfUri+"#AccelerometerX") {
			return getAccelerometerControl(0);
		} else if (controlUri == mobileRdfUri+"#AccelerometerY") {
			return getAccelerometerControl(1);
		}	else if (controlUri == mobileRdfUri+"#AccelerometerZ") {
			return getAccelerometerControl(2);
		} else if (controlUri == mobileRdfUri+"#GeolocationLatitude") {
			return getGeolocationControl(0);
		}	else if (controlUri == mobileRdfUri+"#GeolocationLongitude") {
			return getGeolocationControl(1);
		}	else if (controlUri == mobileRdfUri+"#GeolocationDistance") {
			return getGeolocationControl(2);
		}	else if (controlUri == mobileRdfUri+"#CompassHeading") {
			return getCompassControl(0);
		}	else if (controlUri == mobileRdfUri+"#Slider") {
			var sliderControl = new Control($scope);
			$scope.sliderControls.push(sliderControl);
			$scope.$apply();
			return sliderControl;
		}
	}
	
	var getAccelerometerControl = function(index) {
		if (!$scope.accelerometerWatcher) {
			$scope.accelerometerWatcher = new AccelerometerWatcher();
		}
		if (index == 0) {
			return $scope.accelerometerWatcher.xControl;
		} else if (index == 1) {
			return $scope.accelerometerWatcher.yControl;
		} else {
			return $scope.accelerometerWatcher.zControl;
		}
	}
	
	var getGeolocationControl = function(index) {
		if (!$scope.geolocationWatcher) {
			$scope.geolocationWatcher = new GeolocationWatcher();
		}
		if (index == 0) {
			return $scope.geolocationWatcher.latitudeControl;
		} else if (index == 1) {
			return $scope.geolocationWatcher.longitudeControl;
		} else {
			return $scope.geolocationWatcher.distanceControl;
		}
	}
	
	var getCompassControl = function(index) {
		if (!$scope.compassWatcher) {
			$scope.compassWatcher = new CompassWatcher();
		}
		if (index == 0) {
			return $scope.compassWatcher.headingControl;
		} else {
			return $scope.compassWatcher.accuracyControl;
		}
	}
	
	var getParameter = function(track, parameterUri) {
		if (parameterUri == mobileRdfUri+"#Amplitude") {
			return track.amplitude;
		} else if (parameterUri == mobileRdfUri+"#Pan") {
			return track.pan;
		}	else if (parameterUri == mobileRdfUri+"#Distance") {
			return track.distance;
		} else if (parameterUri == mobileRdfUri+"#ListenerOrientation") {
			return $scope.rendering.listenerOrientation;
		}
	}
	
}