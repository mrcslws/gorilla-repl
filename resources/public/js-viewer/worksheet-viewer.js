/*
 * This file is part of gorilla-repl. Copyright (C) 2014-, Jony Hudson.
 *
 * gorilla-repl is licenced to you under the MIT licence. See the file LICENCE.txt for full details.
 */

// A stripped down worksheet viewmodel for the viewer.

var worksheet = function () {
    var self = {};

    // the content of the worksheet is a list of segments.
    self.segments = ko.observableArray();

    self.titleSegment = ko.computed(function () {
        var segs = self.segments();
        for (i = 0; i < segs.length; i++) {
            if (segs[i].type == "free") {
                return segs[i];
            }
        }

        return null;
    });

    return self;
};
