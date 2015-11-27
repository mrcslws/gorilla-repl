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

    // first of all render the items
    var renderedItems = data.items.map(function (x) {
        var getSaveData = function() { var copy = JSON.parse(JSON.stringify(x));
                                       delete copy["value"];
                                       return copy; };
        var itemSetSaveDataFn = function(f) { getSaveData = f; };
        var r = renderPart(x, callbackQueue, cleanupQueue, errorCallback, itemSetSaveDataFn);
        getSaveDataFns.push(getSaveData);
        return r;
    });

    setSaveDataFn(function() {
        var cloned = JSON.parse(JSON.stringify(data));
        cloned.items = getSaveDataFns.map(function (f) { return f(); });
        delete cloned.value;
        return cloned;
    });

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

    callbackQueue.push(function () {
        vg.parse.spec(data.content, function (chart) {
            try {
                var element = $("#" + uuid).get()[0];
                chart({el: element, renderer: 'svg'}).update();
            } catch (e) {
                // we'll end up here if vega throws an error. We try and route this error back to the
                // segment so the user has an idea of what's going on.
                errorCallback("Vega error (js): " + e.message);
            }
        });
    });

    setSaveDataFn(function () {
        var element = document.getElementById(uuid);
        return {"type":"html",
                "content":
                Array.prototype.map.call(element.getElementsByTagName("svg"), function(svg) {
                    return svg.outerHTML;
                }).reduce(function (accumulated, img) {return accumulated + img;}, "")};
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
