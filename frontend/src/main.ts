import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { MidiServiceService } from './app/shared/services/midi-service.service';

bootstrapApplication(AppComponent, appConfig)
  .then((appRef) => {
    const midiService = appRef.injector.get(MidiServiceService);
  })
  .catch((err) => console.error(err));
