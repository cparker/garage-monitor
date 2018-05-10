
function init() {
    displayDoor()
    displayTemp()
    displayActivity()
}

function displayDoor() {
    fetch(`/doorStatus`)
        .then(response => {
            return response.json()
        })
        .then(data => {
            console.log('door data', data)
            const mom = moment(data.dateTime)
            page.dateTimeElm.innerHTML = mom.format('LT')
            if (data.isOpen) {
                page.statusElm.innerHTML = 'Open'
                page.lockElm.style.display = 'none'
                page.lockOpenElm.style.display = 'block'
                page.body.style.background = 'red'
            } else {
                page.statusElm.innerHTML = 'Closed'
                page.lockElm.style.display = 'block'
                page.lockOpenElm.style.display = 'none'
                page.body.style.background = 'green'
            }
        })
        .catch(error => {
            console.log('error fetching door status', error)
        })
}

function displayTemp() {
    fetch('/temp')
        .then(response => {
            return response.json()
        })
        .then(data => {
            console.log('temp data', data)
            page.currentTempElm.innerHTML = data.tempF.toFixed(1)
        })
        .catch(err => {
            console.log('error fetching temp data')
        })
}

function displayActivity() {
    console.log('displaying activity')
    fetch('doorActivity')
        .then(response => response.json())
        .then(rawData => {
            console.log('got door data', rawData)
            const data = rawData.map(obj => {
                obj.date = moment(obj.dateTime).toDate()
                obj.value = obj.isOpen ? 1 : 0
                return obj
            })
            MG.data_graphic({
                chart_type: 'line',
                xax_format: (d) =>  d.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true }),
                european_clock: false,
                interpolate: d3.curveStep,
                data: data,
                target: '#activityChart',
                x_accessor: 'date',
                y_accessor: 'value',
                y_axis: false,
                color: 'white',
                left:5,
                right:0,
                buffer:0,
                missing_is_zero:true
            });
        })
}

function getPageElements() {
    const page = {}
    page.body = document.querySelector('body')
    page.mainElm = document.querySelector('.main')
    page.lockElm = document.querySelector('.door-icon .lock')
    page.lockOpenElm = document.querySelector('.door-icon .unlock')
    page.statusElm = document.querySelector('.door-text .status')
    page.dateTimeElm = document.querySelector('.bottom .date-time-value')
    page.currentTempElm = document.querySelector('.bottom .temp-value')
    page.activityChart = document.querySelector('#activityChart')
    return page
}


window.onload = () => {
    window.page = getPageElements()
    init()
}