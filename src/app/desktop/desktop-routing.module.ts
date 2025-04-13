import { NgModule } from "@angular/core";
// biome-ignore lint/style/useImportType: <explanation>
import { RouterModule, Routes } from "@angular/router";
import { DesktopComponent } from "./components/desktop/desktop.component";

export const desktopRouteList: Routes = [
    {
        path: '',
        component: DesktopComponent
    }
];

@NgModule({
    imports: [
        RouterModule.forChild(desktopRouteList)
    ]
})
export class DesktopRoutingModule {
}