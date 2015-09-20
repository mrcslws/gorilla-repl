/*
 * This file is part of gorilla-repl. Copyright (C) 2014-, Jony Hudson.
 *
 * gorilla-repl is licenced to you under the MIT licence. See the file LICENCE.txt for full details.
 */


/* Takes a data structure representing the output data and renders it in to the given element. */
var render = function (data, element, hooks, errorCallback) {
    // Support save hooks. Don't give elements direct access to the hooks because sometimes we
    // need to put functions inside of functions, e.g. for list-likes.
    var setSaveDataFn = function(f) {
        hooks.getSaveOutput = function() {
            return JSON.stringify(f());
        };
    };

    // When the output is cleared, call these functions.
    hooks.outputWillUnmount = [];

    // Some parts of the output might need to run js functions to complete the rendering (like Vega graphs for instance)
    // We maintain a list of those functions that we accumulate as we put together the HTML, and then call them all
    // after the HTML has been inserted into the document.
    var callbackQueue = [];

    var htmlString = renderPart(data, callbackQueue, hooks.outputWillUnmount, errorCallback, setSaveDataFn);
    var el = $("<pre>" + htmlString + "</pre>");
    $(element).append(el);
    _.each(callbackQueue, function (callback) {callback()});

    // Attach a click event handler to each element for value copy and paste.
    $(".value", element).click(function (ed) {
        if (ed.altKey) {
            var value = $(this).attr('data-value');
            eventBus.trigger("app:show-value", value);
        }
        return true;
    });
};


var renderPart = function (data, callbackQueue, cleanupQueue, errorCallback, setSaveDataFn) {

    switch (data.type) {
        case "html":
            return renderHTML(data, callbackQueue, cleanupQueue, errorCallback, setSaveDataFn);
        case "list-like":
            return renderListLike(data, callbackQueue, cleanupQueue, errorCallback, setSaveDataFn);
        case "vega":
            return renderVega(data, callbackQueue, errorCallback, setSaveDataFn);
        case "latex":
            return renderLatex(data, callbackQueue, errorCallback);
    }

    return "Unknown render type";
};

// This helper supports value copy and paste.
var wrapWithValue = function (data, content) {
    return "<span class='value' data-value='" + _.escape(data.value) + "'>" + content + "</span>";
};

var renderHTML = function (data, callbackQueue, cleanupQueue, errorCallback, setSaveDataFn) {
    var uuid = UUID.generate();

    if (data.didMount) {
        var didMount = eval(data.didMount);
        callbackQueue.push(function () {
            didMount(document.getElementById(uuid));
        });
    }

    if (data.saveHook) {
        var saveHook = eval(data.saveHook);
        setSaveDataFn(function() {
            return saveHook(document.getElementById(uuid));
        });
    }

    if (data.willUnmount) {
        var willUnmount = eval(data.willUnmount);
        cleanupQueue.push(function() {
            willUnmount(document.getElementById(uuid));
        });
    }

    return wrapWithValue(data, "<span id='" + uuid + "'>" + data.content + "</span>");
};

var renderListLike = function (data, callbackQueue, cleanupQueue, errorCallback, setSaveDataFn) {
    var getSaveDataFns = [];
    var wasSet = false;

    // first of all render the items
    var renderedItems = data.items.map(function (x) {
        var getSaveData = function() { return x; };
        var itemSetSaveDataFn = function(f) { wasSet = true; getSaveData = f; };
        var r = renderPart(x, callbackQueue, cleanupQueue, errorCallback, itemSetSaveDataFn);
        getSaveDataFns.push(getSaveData);
        return r;
    });

    if (wasSet) {
        setSaveDataFn(function() {
            var cloned = JSON.parse(JSON.stringify(data));
            cloned.items = getSaveDataFns.map(function (f) { return f(); });
            return cloned;
        });
    }

    // and then assemble the list
    return wrapWithValue(data, data.open + renderedItems.join(data.separator) + data.close);
};

var renderVega = function (data, callbackQueue, errorCallback, setSaveDataFn) {

    var uuid = UUID.generate();

    // for some reason, Vega will sometimes try and pop up an alert if there's an error, which is not a
    // great user experience. Here we patch the error handling function to re-route any generated message
    // to the segment.
    vg.error = function (msg) {
        errorCallback("Vega error (js): " + msg);
    };

    // For saving. Browsers don't support drawing an SVG to a canvas, so we hack.
    var imgs = [];

    callbackQueue.push(function () {
        vg.parse.spec(data.content, function (chart) {
            try {
                var element = $("#" + uuid).get()[0];
                chart({el: element, renderer: 'svg'}).update();

                // We can't wait until save to do this because in some browsers (e.g. Firefox) the
                // img absorbs the src asynchronously, even for "data:".
                imgs = Array.prototype.map.call(element.getElementsByTagName("svg"), function(svg) {
                    var img = document.createElement("img");
                    img.setAttribute("width", svg.getAttribute("width"));
                    img.setAttribute("height", svg.getAttribute("height"));
                    img.src = "data:image/svg+xml," + (new XMLSerializer).serializeToString(svg);
                    return img;
                });
            } catch (e) {
                // we'll end up here if vega throws an error. We try and route this error back to the
                // segment so the user has an idea of what's going on.
                errorCallback("Vega error (js): " + e.message);
            }
        });
    });

    setSaveDataFn(function() {
        // The raw Vega data can arbitrarily large, while a PNG is predictably medium-sized.
        // To recap, we:
        //  1. Draw an SVG in the page
        //  2. Create a hidden img that contains a copy of the svg
        //  3. Create a hidden canvas which contains a copy of the img
        //  4. Export the canvas as a PNG
        var newContent = imgs.map(function(img) {
            var cnv = document.createElement("canvas");
            var w = img.getAttribute("width");
            var h = img.getAttribute("height");
            cnv.setAttribute("width", w);
            cnv.setAttribute("height", h);
            cnv.getContext("2d").drawImage(img, 0, 0, w, h);
            return "<img src='" + cnv.toDataURL("image/png") + "' />";
        }).reduce(function (accumulated, img) {return accumulated + img;}, "");
        return {
            'type': 'html',
            'content': newContent,
        }
    });

    return wrapWithValue(data, "<span class='vega-span' id='" + uuid + "'></span>");
};

var renderLatex = function (data, callbackQueue, errorCallback) {

    var uuid = UUID.generate();

    callbackQueue.push(function () {
        // MathJax might not be available.
        if ("MathJax" in window) MathJax.Hub.Queue(["Typeset", MathJax.Hub, uuid]);
    });

    return wrapWithValue(data, "<span class='latex-span' id='" + uuid + "'>@@" + data.content + "@@</span>");
};
