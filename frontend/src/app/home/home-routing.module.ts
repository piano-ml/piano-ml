import { NgModule } from "@angular/core";
// biome-ignore lint/style/useImportType: <explanation>
import { RouterModule, Routes } from "@angular/router";
import { HomeComponent } from "./components/home/home.component";
import { SummaryComponent } from "./components/summary/summary.component";
import { homeSeo, summarySeo } from "./home.seo";
import { ROUTE_LABELS } from '../shared/i18n/route-labels';

export const desktopRouteList: Routes = [
    {
        path: '',
        component: HomeComponent,
        data: { seo: homeSeo }
    },
    {
        path: 'summary',
        component: SummaryComponent,
        data: { breadcrumb: ROUTE_LABELS.summary, seo: summarySeo }
    }
];

@NgModule({
    imports: [
        RouterModule.forChild(desktopRouteList)
    ]
})
export class HomeRoutingModule {
}
