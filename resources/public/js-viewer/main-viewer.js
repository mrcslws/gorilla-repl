/*
 * This file is part of gorilla-repl. Copyright (C) 2014-, Jony Hudson.
 *
 * gorilla-repl is licenced to you under the MIT licence. See the file LICENCE.txt for full details.
 */


var app = function () {
    var self = {};

    self.worksheet = ko.observable(worksheet());
    self.title = ko.computed(function () {
        var content = self.worksheet() &&
            self.worksheet().titleSegment() &&
            self.worksheet().titleSegment().renderedContent();

        var el = document.createElement("span");
        el.innerHTML = content;
        var h1 = el.getElementsByTagName("h1")[0];
        return (h1 && h1.textContent) || "Gorilla REPL Viewer";
    });
    self.sourceURL = ko.observable("");
    self.loading = ko.observable(true);

    // The copyBox is a UI element that gives links to the source of the worksheet, and how to copy/edit it.
    self.copyBoxVisible = ko.observable(false);
    self.showCopyBox = function () {
        self.copyBoxVisible(true);
    };
    self.hideCopyBox = function () {
        self.copyBoxVisible(false);
    };

    self.start = function (worksheetData, sourceURL) {

        self.worksheet().segments(worksheetParser.parse(worksheetData));
        self.sourceURL(sourceURL);

        // wire up the UI
        ko.applyBindings(self, document.getElementById("document"));

        // we only use CodeMirror to syntax highlight the code in the viewer
        CodeMirror.colorize($("pre.static-code"), "text/x-clojure");

        self.loading(false);
    };

    return self;
};

var getParameterByName = function (name) {
    var match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
};

// The application entry point
$(function () {
    var viewer = app();
    // how are we getting the worksheet data?

    var source = getParameterByName("source");
    switch (source) {
        case "github":
            var user = getParameterByName("user");
            var repo = getParameterByName("repo");
            var path = getParameterByName("path");
            getFromGithub(user, repo, path, function (data) {
                viewer.start(data, "https://github.com/" + user + "/" + repo);
            });
            return;
        case "gist":
            var id = getParameterByName("id");
            var filename = getParameterByName("filename");
            getFromGist(id, filename, function (data) {
                viewer.start(data,  "https://gist.github.com/" + id);
            });
            return;
        case "bitbucket":
            var user = getParameterByName("user");
            var repo = getParameterByName("repo");
            var path = getParameterByName("path");
            var revision = getParameterByName("revision") || "HEAD";
            getFromBitbucket(user, repo, path, revision, function (data) {
                viewer.start(data, "https://bitbucket.org/" + user + "/" + repo);
            });
            return;
        case "test":
            // so you can test without exhausting the github API limit
            $.get('/test.clj').success(function (data) {
                viewer.start(data, source);
            });
            return;
        default:
            // assume the path is a URL
            var path = getParameterByName("path");
            if (path) {
                var fastPath = path.replace(/\.clj$/, ".faster.clj");
                $.ajax({url: fastPath,
                        cache: false,
                        success: (function (data) {
                            viewer.start(data, path);
                        }),
                        error: (function () {
                            $.get(path).success(function (data) {
                                viewer.start(data, path);
                            })})});
            }
    }
});
