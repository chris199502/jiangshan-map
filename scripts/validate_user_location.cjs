'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Browser I/O is supplied here; the controller's projection, marker and UI logic run unchanged.
class Element {
  constructor() {
    this.attributes = {};
    this.children = [];
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
    };
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  appendChild(child) { this.children.push(child); }
  addEventListener() {}
  querySelectorAll() { return []; }
  set innerHTML(value) { this.children = []; }
}

function fixture() {
  let success, failure;
  const sandbox = {
    window: { addEventListener() {}, isSecureContext: true },
    navigator: { geolocation: { getCurrentPosition(ok, fail) { success = ok; failure = fail; } } },
    document: { createElementNS() { return new Element(); } },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8'), sandbox);
  const ctrl = Object.create(sandbox.window.HistoricalAtlasController.prototype);
  const elements = Object.fromEntries(['act-user-location', 'user-location-status', 'viewport-frame'].map(id => [id, new Element()]));
  Object.assign(ctrl, {
    locale: 'zh', camera: { x: 0, y: 0, w: 1000, h: 700 },
    projector: new sandbox.window.MercatorProjector(1000, 700, { west: 66, east: 142, south: 14, north: 55 }),
    grpUserLocation: new Element(),
    grpMilestones: new Element(), milestoneBalloon: new Element(), hoverTip: new Element(),
    dynasties: [{ key: 'tang', fromYear: 618, toYear: 907, milestones: [] }], dynastyIdx: 0,
    activeMilestone: { milestone: { coord: [108.94, 34.26] }, anchorCoord: [108.94, 34.26], isAuto: true },
    activeTrace: [108.94, 34.26], activePerson: { name: '李白' },
    activeCustomRoute: [{ lng: 108.94, lat: 34.26 }], year: 741,
    _id: id => elements[id],
    _zh: text => text,
    _cancelCameraAnimation() {},
    _cancelPendingHover() {},
    _getViewportAspect: () => 0.7,
    _updateScaleBar() {},
    _positionMilestoneBalloon() {},
    _animateCameraTo(target) { this.camera = target; },
    stopAutoplay() {},
  });
  return { ctrl, sandbox, elements, success: coords => success({ coords }), failure: code => failure({ code }) };
}

{
  const { ctrl } = fixture();
  const pins = [new Element(), new Element(), new Element()];
  const coordinates = [[118, 32], [118.0005, 32], [118.01, 32]];
  const dynasty = ctrl.dynasties[0];
  dynasty.milestones = coordinates.map(coord => ({ year: 741, coord }));
  pins.forEach((pin, idx) => {
    pin.dataset = { idx, year: 741, lng: coordinates[idx][0], lat: coordinates[idx][1] };
  });
  ctrl.grpMilestones.querySelectorAll = () => pins;
  ctrl.userLocation = [118, 32];
  ctrl._updateMilestoneStates(dynasty);
  assert.ok(pins[0].classList.contains('is-user-location'), 'A coincident diamond uses the blue-dot appearance');
  assert.ok(pins[1].classList.contains('is-user-location'), 'Rounded event coordinates at the same site still merge');
  assert.ok(!pins[2].classList.contains('is-user-location'), 'Nearby but distinct places keep their diamonds');
  ctrl.userLocation = [119, 33];
  ctrl._updateMilestoneStates(dynasty);
  assert.ok(pins.every(pin => !pin.classList.contains('is-user-location')), 'Moving location restores former diamonds');
}

const coords = { longitude: 118.78, latitude: 32.06, accuracy: 20 };
{
  const f = fixture();
  assert.equal(typeof f.ctrl.toggleUserLocation, 'function', 'The location button can turn location off');
  const pin = new Element();
  pin.dataset = { idx: '0', lng: coords.longitude, lat: coords.latitude, year: 741 };
  f.ctrl.dynasties[0].milestones = [{ coord: [coords.longitude, coords.latitude], year: 741 }];
  f.ctrl.grpMilestones.querySelectorAll = () => [pin];
  f.ctrl.toggleUserLocation();
  assert.equal(f.elements['act-user-location'].disabled, false, 'A pending request remains cancellable');
  assert.equal(f.elements['act-user-location'].attributes['aria-busy'], 'true');
  f.success(coords);
  assert.ok(pin.classList.contains('is-user-location'));
  const { camera, activeTrace, activePerson, activeCustomRoute, activeMilestone, year } = f.ctrl;
  assert.equal(f.elements['act-user-location'].attributes['aria-pressed'], 'true');
  assert.equal(f.elements['act-user-location'].attributes['aria-label'], '关闭定位');
  f.ctrl.toggleUserLocation();
  assert.equal(f.ctrl.userLocation, null, 'Turning off location clears device coordinates');
  assert.equal(f.ctrl.grpUserLocation.children.length, 0, 'Turning off location removes the blue dot');
  assert.ok(!pin.classList.contains('is-user-location'), 'Turning off location restores the diamond');
  assert.equal(f.ctrl.formatDistanceFromUser([118, 32]), '', 'Turning off location removes event distances');
  assert.equal(f.elements['act-user-location'].attributes['aria-pressed'], 'false');
  assert.equal(f.elements['act-user-location'].attributes['aria-label'], '我的位置');
  for (const [key, value] of Object.entries({ camera, activeTrace, activePerson, activeCustomRoute, activeMilestone, year })) {
    assert.equal(f.ctrl[key], value, `Turning off location preserves ${key}`);
  }
  f.ctrl.toggleUserLocation();
  f.success(coords);
  assert.equal(f.ctrl.grpUserLocation.children.length, 1, 'Location can be enabled again after cancellation');
}
{
  const f = fixture();
  f.ctrl.toggleUserLocation();
  const oldSuccess = f.success, oldFailure = f.failure;
  // Capture callbacks before starting another request.
  let lateSuccess, lateFailure;
  f.sandbox.navigator.geolocation.getCurrentPosition = (ok, fail) => { lateSuccess = ok; lateFailure = fail; };
  f.ctrl.toggleUserLocation();
  oldSuccess(coords);
  oldFailure(1);
  assert.equal(f.ctrl.userLocationStatus, 'idle', 'Cancelled callbacks cannot restore location or show errors');
  assert.equal(f.ctrl.grpUserLocation.children.length, 0);
  f.ctrl.toggleUserLocation();
  const cancelledSuccess = lateSuccess, cancelledFailure = lateFailure;
  f.ctrl.toggleUserLocation();
  f.ctrl.toggleUserLocation();
  cancelledSuccess({ coords });
  cancelledFailure({ code: 1 });
  assert.equal(f.ctrl.userLocationStatus, 'locating', 'An old request cannot change a newly enabled request');
  lateSuccess({ coords: { longitude: 116.4, latitude: 39.9 } });
  assert.equal(f.ctrl.userLocation[0], 116.4, 'Only the newest request supplies the location');
}
{
  const { ctrl } = fixture();
  assert.equal(typeof ctrl.openUserLocationEvent, 'function', 'The blue dot handles its own event selection');
  ctrl.userLocation = [118.78, 32.06];
  ctrl.openUserLocationEvent();
  assert.equal(ctrl.activeMilestone, null, 'An unrelated historical event never belongs to the blue dot');
  assert.ok(ctrl.hoverTip.classList.contains('is-hidden'), 'Blue-dot interaction dismisses underlying tooltips');
}
{
  const { ctrl } = fixture();
  const current = new Element(), past = new Element(), future = new Element();
  current.dataset = { idx: '0', siteIdx: '1' };
  past.dataset = { idx: '1', siteIdx: '0' };
  future.dataset = { idx: '2', siteIdx: '0' };
  current.classList.add('is-current');
  future.classList.add('is-future');
  ctrl.dynasties[0].milestones = [{ headline: 'Current event' }, { headline: 'Past event' }, { headline: 'Future event' }];
  ctrl.grpMilestones.querySelectorAll = selector => selector === '.milestone-pin.is-user-location' ? [current, past, future] : [];
  let opened;
  ctrl.openMilestoneBalloon = (dynasty, milestone, options) => { opened = { dynasty, milestone, options }; };
  ctrl.openUserLocationEvent();
  assert.equal(opened.milestone, ctrl.dynasties[0].milestones[0], 'A coincident blue dot opens the current diamond event');
  assert.equal(opened.options.siteIdx, 1, 'A multi-site event opens the coincident site');
  ctrl.grpMilestones.classList.add('is-hidden');
  opened = null;
  ctrl.openUserLocationEvent();
  assert.equal(opened, null, 'Hiding events also hides blue-dot event interaction');
}
{
  const f = fixture();
  assert.equal(typeof f.ctrl.requestUserLocation, 'function', 'A user can request their device location');
  const trace = f.ctrl.activeTrace, person = f.ctrl.activePerson, route = f.ctrl.activeCustomRoute;
  const event = f.ctrl.activeMilestone;
  f.ctrl.requestUserLocation();
  assert.equal(f.elements['act-user-location'].attributes['aria-busy'], 'true', 'Location request is visibly pending');
  f.success(coords);
  const [x, y] = f.ctrl.projector.toScreen(118.78, 32.06);
  assert.ok(Math.abs(f.ctrl.camera.x + f.ctrl.camera.w / 2 - x) < 0.01, 'Camera centers on the returned longitude');
  assert.ok(Math.abs(f.ctrl.camera.y + f.ctrl.camera.h / 2 - y) < 0.01, 'Camera centers on the returned latitude');
  assert.equal(f.ctrl.grpUserLocation.children.length, 1, 'Location has its own marker');
  assert.equal(f.ctrl.activeTrace, trace, 'Existing manual selection is preserved');
  assert.equal(f.ctrl.activePerson, person, 'Person selection is preserved');
  assert.equal(f.ctrl.activeCustomRoute, route, 'Search route is preserved');
  assert.equal(f.ctrl.year, 741);
  assert.equal(f.ctrl.activeMilestone, event, 'The diamond retains its own event while my location is displayed');
  assert.equal(f.elements['act-user-location'].disabled, false);
  f.ctrl.requestUserLocation();
  f.success(coords);
  assert.equal(f.ctrl.grpUserLocation.children.length, 1, 'Repeated requests replace the location marker');
}
{
  const f = fixture();
  f.ctrl.requestUserLocation();
  f.ctrl._userLocationShouldCenter = false;
  const camera = f.ctrl.camera;
  f.success(coords);
  assert.equal(f.ctrl.camera, camera, 'A late response does not interrupt a newer interaction');
  assert.equal(f.ctrl.grpUserLocation.children.length, 1);
  assert.ok(f.ctrl.activeMilestone, 'A delayed response preserves the event the user is reading');
}
{
  const f = fixture();
  f.ctrl.requestUserLocation();
  f.ctrl.camera = { x: 10, y: 20, w: 500, h: 350 };
  const camera = f.ctrl.camera;
  f.success(coords);
  assert.equal(f.ctrl.camera, camera, 'Programmatic search navigation also takes priority');
}
for (const [code, status] of [[1, 'denied'], [2, 'unavailable'], [3, 'timeout']]) {
  const f = fixture();
  const camera = f.ctrl.camera;
  f.ctrl.requestUserLocation();
  f.failure(code);
  assert.equal(f.ctrl.userLocationStatus, status);
  assert.equal(f.ctrl.camera, camera, 'Failed location leaves the map usable');
  assert.equal(f.elements['act-user-location'].disabled, false, 'A failed request can be retried');
  assert.ok(f.elements['user-location-status'].textContent.length > 0);
}
for (const coords of [{ longitude: -122.42, latitude: 37.77 }, { longitude: NaN, latitude: 32 }]) {
  const f = fixture();
  const camera = f.ctrl.camera;
  f.ctrl.requestUserLocation();
  f.success(coords);
  assert.equal(f.ctrl.camera, camera, 'Locations outside the atlas never move the camera off-map');
  assert.equal(f.ctrl.grpUserLocation.children.length, 0);
  assert.equal(f.elements['act-user-location'].disabled, false);
}
for (const kind of ['unsupported', 'insecure']) {
  const f = fixture();
  if (kind === 'unsupported') delete f.sandbox.navigator.geolocation;
  else f.sandbox.window.isSecureContext = false;
  f.ctrl.requestUserLocation();
  assert.equal(f.ctrl.userLocationStatus, kind);
  assert.equal(f.elements['act-user-location'].disabled, false);
}
{
  const { ctrl } = fixture();
  assert.equal(ctrl.formatDistanceFromUser([118, 33]), '', 'No distance without device location');
  ctrl.userLocation = [118, 32];
  assert.equal(ctrl.formatDistanceFromUser([118, 33]), '距你约 111 公里（直线）');
  assert.equal(ctrl.formatDistanceFromUser([118, 32.0005]), '距你约 56 米（直线）');
  ctrl.locale = 'en';
  assert.equal(ctrl.formatDistanceFromUser([118, 33]), 'About 111 km from you (straight line)');
}
console.log('User-location checks passed (centering, separate events, distances, interaction priority, errors and bounds).');
