import { plural, template } from '@inkbar/core'

import type { SandboxStrings } from './types.ts'

// A machine draft awaiting a read by a fluent speaker, like Inkbar's own French. It uses the
// words Inkbar's French set uses for the same things (caviardage, signets, visionneuse).
// French typography: a narrow no-break space (U+202F) before `:`, `?`, `!` and `;`.

/** The sandbox's own words in French. */
export const fr: SandboxStrings = {
  lang: 'fr',
  shell: {
    pageTitle: template('fr', '{scenario} · {framework} · Bac à sable Inkbar'),
    home: 'accueil',
    breadcrumb: 'Fil d’Ariane',
    mainLinks: 'Principal',
    docs: 'Docs',
    language: 'Langue',
    scenarios: 'Scénarios',
    framework: 'Framework',
    frameworkNamed: template('fr', 'Framework : {name}'),
    frameworks: 'Frameworks',
    view: 'Affichage',
    preview: 'Aperçu',
    code: 'Code',
    dropHint: 'Ouvrez ou déposez votre propre PDF. Il reste dans votre navigateur.',
    panels: 'Panneaux',
    events: 'Événements',
    values: 'Valeurs',
    clear: 'Effacer',
    eventCount: plural('fr', 'count', {
      one: '{count} événement',
      many: '{count} d’événements',
      other: '{count} événements',
    }),
    eventsEmpty: 'Utilisez la visionneuse. Ses callbacks s’affichent ici.',
    valuesNote: 'Les valeurs des champs du formulaire, au format Gloss.',
    fieldValues: 'Valeurs des champs',
    files: 'Fichiers',
    copy: 'Copier',
    copied: 'Copié',
    copyFailed: 'Échec de la copie',
    viewOnGitHub: 'Voir sur GitHub',
    loadingCode: 'Chargement du code…',
    codeFailed: 'Impossible de charger le code. Changez d’onglet pour réessayer.',
    languageFailed: 'Impossible de charger cette langue.',
    scenarioFailed: 'Impossible de charger ce scénario.',
    notPdf: template('fr', '{name} n’est pas un PDF.'),
    unreadable: template('fr', 'Impossible de lire {name}.'),
    opened: template('fr', '{name} est ouvert.'),
    noViewer: template('fr', 'Aucune visionneuse ne peut ouvrir {name}.'),
  },
  scenarios: {
    tour: {
      title: 'Visite des annotations',
      blurb:
        'Tous les outils de création, sur un document qui contient déjà une annotation de chaque type.',
    },
    tools: {
      title: 'Choisissez vos outils',
      blurb:
        'Seuls les outils que vous importez se retrouvent dans votre bundle. Celui-ci enregistre le surlignage et la note.',
    },
    forms: {
      title: 'Remplir un formulaire',
      blurb:
        'Champs de texte, cases à cocher, boutons radio, une liste de choix et un champ de signature. Aucun outil de création nécessaire.',
    },
    save: {
      title: 'Enregistrer et rouvrir',
      blurb:
        'Télécharger écrit vos annotations dans le PDF. Ouvrez le fichier enregistré : elles reviennent, prêtes à être modifiées.',
    },
    redactions: {
      title: 'Plugins personnalisés',
      blurb:
        'Un plugin ajoute sa propre commande, ses enregistrements, ses marques et ses cartes, et fonctionne dans tous les frameworks. Celui-ci suggère des caviardages.',
    },
    controlled: {
      title: 'Annotations contrôlées',
      blurb:
        'Votre application gère la liste des annotations et est informée de chaque modification.',
    },
    search: {
      title: 'Rechercher dans un long document',
      blurb:
        'Deux cents pages. Seules les pages proches de la zone visible sont affichées, et la recherche porte sur toutes.',
    },
    sidebars: {
      title: 'Barres latérales',
      blurb:
        'Vignettes, recherche et un panneau à vous, en rail, en onglets ou empilés, d’un côté ou de l’autre.',
    },
    outline: {
      title: 'Signets et liens',
      blurb:
        'Parcourez un long document depuis ses signets, sa table des matières, son index et ses renvois.',
    },
    locked: {
      title: 'Ouvrir un fichier verrouillé',
      blurb:
        'Un PDF protégé par mot de passe. Inkbar demande le mot de passe avant de l’ouvrir. Le mot de passe est « inkbar ».',
    },
    events: {
      title: 'Appui et appui long',
      blurb:
        'Un plugin détecte les appuis et les appuis longs sur la page. Sur un téléphone ou une tablette, pincez pour zoomer dans le document.',
    },
  },
  labels: {
    tools: 'Outils',
    style: 'Style',
    history: 'Historique',
    file: 'Fichier',
    page: 'Page',
    zoom: 'Zoom',
    pageAndZoom: 'Page et zoom',
    openPdf: 'Ouvrir un PDF',
    open: 'Ouvrir',
    suggest: 'Suggérer',
    layout: 'Disposition',
    rail: 'Rail',
    tabs: 'Onglets',
    stack: 'Pile',
    outline: 'Signets',
    pages: 'Pages',
    search: 'Recherche',
    about: 'À propos',
    aboutFill:
      'Remplissez une barre latérale avec ce dont vous avez besoin : vignettes des pages, résultats de recherche ou vos propres composants.',
    aboutRecords:
      'Les panneaux peuvent lire et écrire les enregistrements d’un plugin. Une liste ici montre donc les mêmes données qu’un plugin marque sur la page.',
    searchResults: 'Résultats de recherche',
    suggestions: 'Suggestions',
    accepted: 'Acceptées',
    undoAccept: 'Annuler l’acceptation',
    nothingAccepted: 'Rien n’a encore été accepté.',
    acceptedAt: template('fr', '{text}, page {page}'),
    plugin: {
      command: 'Suggérer des caviardages',
      found: plural('fr', 'count', {
        one: '{count} suggestion',
        many: '{count} de suggestions',
        other: '{count} suggestions',
      }),
      failed: 'Impossible de vérifier ce document.',
      mark: template('fr', 'Caviardage suggéré : {reason}'),
      card: 'Caviardage suggéré',
      lowConfidence: 'Confiance faible',
      mediumConfidence: 'Confiance moyenne',
      highConfidence: 'Confiance élevée',
      accept: 'Accepter',
      dismiss: 'Ignorer',
      reasons: {
        'ni-number': 'Numéro de National Insurance',
        email: 'Adresse e-mail',
        phone: 'Numéro de téléphone',
      },
      explanations: {
        'ni-number': 'Deux lettres, six chiffres et une lettre finale.',
        email: 'L’adresse e-mail d’un client.',
        phone: 'Onze chiffres commençant par 07, comme un numéro de mobile britannique.',
      },
    },
  },
}
