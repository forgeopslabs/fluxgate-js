import '@angular/compiler';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

// The tests import the ng-packagr build (dist/), whose partial declarations
// the JIT compiler above finishes at runtime, as in an application.
